package main

import (
	"context"
	"embed"
	"encoding/base64"
	"encoding/json"
	"flag"
	"fmt"
	"io/fs"
	"log"
	"net/http"
	"net/url"
	"sort"
	"strings"
	"sync"
	"time"

	"connectrpc.com/connect"
	"connectrpc.com/validate"
	"github.com/gabriel-vasile/mimetype"
	"github.com/google/uuid"
	"github.com/rs/cors"
	"golang.org/x/net/http2"
	"golang.org/x/net/http2/h2c"
	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/reflect/protoreflect"
	"google.golang.org/protobuf/types/known/timestamppb"

	mitmflowv1 "github.com/sudorandom/mitmflow/gen/go/mitmflow/v1"
	mitmproxygrpcv1 "github.com/sudorandom/mitmflow/gen/go/mitmproxygrpc/v1"
)

//go:embed all:dist
var dist embed.FS

type stringArrayFlags []string

func (i *stringArrayFlags) String() string {
	return strings.Join(*i, ",")
}

func (i *stringArrayFlags) Set(value string) error {
	*i = append(*i, value)
	return nil
}

var (
	addr            = flag.String("addr", "127.0.0.1:50051", "Address to listen on")
	dataDir         = flag.String("data-dir", "mitmflow_data", "Directory to store flow data")
	maxFlows        = flag.Int("max-flows", 500, "Maximum number of unpinned flows to keep")
	descriptorFiles stringArrayFlags
)

func init() {
	flag.Var(&descriptorFiles, "descriptor-set", "Path to a protobuf descriptor set file (can be repeated)")
}

type MITMFlowServer struct {
	subscribers map[string]chan *mitmflowv1.Flow
	mu          sync.RWMutex
	storage     *FlowStorage
	registry    *Registry
}

func NewMITMFlowServer(storage *FlowStorage, registry *Registry) (*MITMFlowServer, error) {
	return &MITMFlowServer{
		subscribers: make(map[string]chan *mitmflowv1.Flow),
		storage:     storage,
		registry:    registry,
	}, nil
}

func (s *MITMFlowServer) ExportFlow(
	ctx context.Context,
	stream *connect.ClientStream[mitmproxygrpcv1.ExportFlowRequest],
) (*connect.Response[mitmproxygrpcv1.ExportFlowResponse], error) {
	var flowCount uint64
	for stream.Receive() {
		flowCount++
		req := stream.Msg()
		inFlow := req.GetFlow()
		flow := &mitmflowv1.Flow{}
		switch inFlow.WhichFlow() {
		case mitmproxygrpcv1.Flow_HttpFlow_case:
			flow.SetHttpFlow(inFlow.GetHttpFlow())
		case mitmproxygrpcv1.Flow_DnsFlow_case:
			flow.SetDnsFlow(inFlow.GetDnsFlow())
		case mitmproxygrpcv1.Flow_TcpFlow_case:
			flow.SetTcpFlow(inFlow.GetTcpFlow())
		case mitmproxygrpcv1.Flow_UdpFlow_case:
			flow.SetUdpFlow(inFlow.GetUdpFlow())
		default:
			log.Printf("unknown flow type: %T", inFlow.WhichFlow())
			continue
		}
		s.preprocessFlow(flow)
		if err := s.storage.SaveFlow(flow); err != nil {
			log.Printf("failed to save flow: %v", err)
		}
		s.mu.RLock()
		for _, ch := range s.subscribers {
			select {
			case ch <- flow:
			default:
				// subscriber is not ready, drop the flow
			}
		}
		s.mu.RUnlock()
	}
	if err := stream.Err(); err != nil {
		return nil, connect.NewError(connect.CodeCanceled, err)
	}
	log.Printf("Client disconnected gracefully. Received %d flows in total.", flowCount)
	res := &connect.Response[mitmproxygrpcv1.ExportFlowResponse]{
		Msg: mitmproxygrpcv1.ExportFlowResponse_builder{
			Message:        proto.String(fmt.Sprintf("Received %d flows", flowCount)),
			Received:       proto.Bool(true),
			FlowsProcessed: proto.Uint64(flowCount),
		}.Build(),
	}
	return res, nil
}

func (s *MITMFlowServer) GetFlow(
	ctx context.Context,
	req *connect.Request[mitmflowv1.GetFlowRequest],
) (*connect.Response[mitmflowv1.GetFlowResponse], error) {
	id := req.Msg.GetFlowId()
	flow, ok := s.storage.GetFlow(id)
	if !ok {
		return nil, connect.NewError(connect.CodeNotFound, fmt.Errorf("flow not found: %s", id))
	}
	return connect.NewResponse(mitmflowv1.GetFlowResponse_builder{Flow: flow}.Build()), nil
}

func (s *MITMFlowServer) GetFlows(
	ctx context.Context,
	req *connect.Request[mitmflowv1.GetFlowsRequest],
	stream *connect.ServerStream[mitmflowv1.GetFlowsResponse],
) error {
	// Reverse iteration (newest first)
	limit := int(req.Msg.GetLimit())
	if limit <= 0 {
		limit = 500
	}

	count := 0
	filter := req.Msg.GetFilter()

	sendFlow := func(flow *mitmflowv1.Flow) error {
		summary := convertToSummary(flow)
		builder := mitmflowv1.GetFlowsResponse_builder{
			Flow: summary,
		}
		return stream.Send(builder.Build())
	}

	var iterErr error
	s.storage.ReverseWalk(func(flow *mitmflowv1.Flow) bool {
		if matchFlow(flow, filter) {
			if err := sendFlow(flow); err != nil {
				iterErr = err
				return false
			}
			count++
			if count >= limit {
				return false
			}
		}
		return true
	})

	if iterErr != nil {
		return iterErr
	}

	return nil
}

func (s *MITMFlowServer) StreamFlows(
	ctx context.Context,
	req *connect.Request[mitmflowv1.StreamFlowsRequest],
	stream *connect.ServerStream[mitmflowv1.StreamFlowsResponse],
) error {
	// Increased buffer size to prevent blocking/dropping during heavy load or history iteration
	ch := make(chan *mitmflowv1.Flow, 500)
	id := uuid.New().String()
	s.mu.RLock()
	s.subscribers[id] = ch
	s.mu.RUnlock()

	defer func() {
		s.mu.Lock()
		delete(s.subscribers, id)
		s.mu.Unlock()
		close(ch)
	}()

	sinceNs := req.Msg.GetSinceTimestampNs()
	filter := req.Msg.GetFilter()

	sendFlow := func(flow *mitmflowv1.Flow) error {
		summary := convertToSummary(flow)
		builder := mitmflowv1.StreamFlowsResponse_builder{
			Flow: summary,
		}
		return stream.Send(builder.Build())
	}

	// Helper to drain the channel of any new flows that arrived while we were processing history
	drainChannel := func() error {
		for {
			select {
			case flow := <-ch:
				if !matchFlow(flow, filter) {
					continue
				}
				if err := sendFlow(flow); err != nil {
					return err
				}
			default:
				return nil
			}
		}
	}

	// Only backfill if sinceNs is provided (Resume scenario)
	// If sinceNs is 0, we assume "start from now" (Live scenario)
	if sinceNs > 0 {
		var iterErr error
		iterCount := 0
		s.storage.ReverseWalk(func(flow *mitmflowv1.Flow) bool {
			// Periodically check context and drain channel
			iterCount++
			if iterCount%10 == 0 {
				if ctx.Err() != nil {
					return false
				}
				if err := drainChannel(); err != nil {
					iterErr = err
					return false
				}
			}

			if GetFlowStartTime(flow) <= sinceNs {
				return false
			}
			if !matchFlow(flow, filter) {
				return true
			}
			if err := sendFlow(flow); err != nil {
				iterErr = err
				return false
			}
			return true
		})

		if ctx.Err() != nil {
			return nil
		}
		if iterErr != nil {
			return iterErr
		}
	}

	// Ensure any remaining flows in channel are sent
	if err := drainChannel(); err != nil {
		return err
	}

	// Live streaming loop
	ticker := time.NewTicker(100 * time.Millisecond)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return nil
		case flow := <-ch:
			if !matchFlow(flow, filter) {
				continue
			}
			if err := sendFlow(flow); err != nil {
				return err
			}
		case <-ticker.C:
			// Just to ensure we check ctx.Done regularly if channel is empty, though select handles it.
		}
	}
}

func (s *MITMFlowServer) UpdateFlow(
	ctx context.Context,
	req *connect.Request[mitmflowv1.UpdateFlowRequest],
) (*connect.Response[mitmflowv1.UpdateFlowResponse], error) {
	log.Printf("UpdateFlow: ID=%s Pinned=%v Note=%v", req.Msg.GetFlowId(), req.Msg.GetPinned(), req.Msg.GetNote())
	var pinned *bool
	if req.Msg.HasPinned() {
		p := req.Msg.GetPinned()
		pinned = &p
	}
	var note *string
	if req.Msg.HasNote() {
		n := req.Msg.GetNote()
		note = &n
	}

	flow, err := s.storage.UpdateFlow(req.Msg.GetFlowId(), pinned, note)
	if err != nil {
		log.Printf("UpdateFlow error: %v", err)
		return nil, connect.NewError(connect.CodeNotFound, err)
	}

	s.mu.RLock()
	for _, ch := range s.subscribers {
		select {
		case ch <- flow:
		default:
		}
	}
	s.mu.RUnlock()

	summary := convertToSummary(flow)
	return connect.NewResponse(mitmflowv1.UpdateFlowResponse_builder{Flow: summary}.Build()), nil
}

func convertToSummary(flow *mitmflowv1.Flow) *mitmflowv1.FlowSummary {
	id := GetFlowID(flow)
	startTime := GetFlowStartTime(flow)
	
	var ts *timestamppb.Timestamp
	if startTime != 0 {
		ts = &timestamppb.Timestamp{
			Seconds: startTime / 1e9,
			Nanos:   int32(startTime % 1e9),
		}
	}

	builder := mitmflowv1.FlowSummary_builder{
		Id:             proto.String(id),
		TimestampStart: ts,
		Pinned:         proto.Bool(flow.GetPinned()),
		Note:           proto.String(flow.GetNote()),
	}

	switch flow.WhichFlow() {
	case mitmflowv1.Flow_HttpFlow_case:
		f := flow.GetHttpFlow()
		builder.Type = proto.String("http")
		
		reqLen := int64(0)
		if f.GetRequest() != nil {
			reqLen = int64(len(f.GetRequest().GetContent()))
		}
		resLen := int64(0)
		if f.GetResponse() != nil {
			resLen = int64(len(f.GetResponse().GetContent()))
		}
		
		builder.Http = mitmflowv1.HttpFlowSummary_builder{
			Method:               proto.String(f.GetRequest().GetMethod()),
			Url:                  proto.String(getPrettyURL(f.GetRequest())),
			StatusCode:           proto.Int32(f.GetResponse().GetStatusCode()),
			DurationMs:           proto.Int64(int64(f.GetDurationMs())),
			RequestContentLength: proto.Int64(reqLen),
			ResponseContentLength: proto.Int64(resLen),
			ClientPeernameHost:   proto.String(f.GetClient().GetPeernameHost()),
			ClientPeernamePort:   proto.Uint32(f.GetClient().GetPeernamePort()),
			ServerAddressHost:    proto.String(f.GetServer().GetAddressHost()),
			ServerAddressPort:    proto.Uint32(f.GetServer().GetAddressPort()),
		}.Build()
	case mitmflowv1.Flow_DnsFlow_case:
		f := flow.GetDnsFlow()
		builder.Type = proto.String("dns")
		dnsBuilder := mitmflowv1.DnsFlowSummary_builder{
			ClientPeernameHost: proto.String(f.GetClient().GetPeernameHost()),
			Error:              proto.String(f.GetError()),
		}
		if f.GetRequest() != nil && len(f.GetRequest().GetQuestions()) > 0 {
			dnsBuilder.QuestionName = proto.String(f.GetRequest().GetQuestions()[0].GetName())
		}
		builder.Dns = dnsBuilder.Build()
	case mitmflowv1.Flow_TcpFlow_case:
		f := flow.GetTcpFlow()
		builder.Type = proto.String("tcp")
		builder.Tcp = mitmflowv1.TcpFlowSummary_builder{
			ServerAddressHost:  proto.String(f.GetServer().GetAddressHost()),
			ServerAddressPort:  proto.Uint32(f.GetServer().GetAddressPort()),
			ClientPeernameHost: proto.String(f.GetClient().GetPeernameHost()),
			ClientPeernamePort: proto.Uint32(f.GetClient().GetPeernamePort()),
			Error:              proto.String(f.GetError()),
		}.Build()
	case mitmflowv1.Flow_UdpFlow_case:
		f := flow.GetUdpFlow()
		builder.Type = proto.String("udp")
		builder.Udp = mitmflowv1.UdpFlowSummary_builder{
			ServerAddressHost:  proto.String(f.GetServer().GetAddressHost()),
			ServerAddressPort:  proto.Uint32(f.GetServer().GetAddressPort()),
			ClientPeernameHost: proto.String(f.GetClient().GetPeernameHost()),
			ClientPeernamePort: proto.Uint32(f.GetClient().GetPeernamePort()),
			Error:              proto.String(f.GetError()),
		}.Build()
	}
	return builder.Build()
}

func (s *MITMFlowServer) DeleteFlows(
	ctx context.Context,
	req *connect.Request[mitmflowv1.DeleteFlowsRequest],
) (*connect.Response[mitmflowv1.DeleteFlowsResponse], error) {
	var count int64
	var err error

	if req.Msg.GetAll() {
		count, err = s.storage.DeleteAllFlows()
	} else {
		count, err = s.storage.DeleteFlows(req.Msg.GetFlowIds())
	}

	if err != nil {
		log.Printf("DeleteFlows error: %v", err)
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	return connect.NewResponse(mitmflowv1.DeleteFlowsResponse_builder{Count: proto.Int64(count)}.Build()), nil
}

func (s *MITMFlowServer) preprocessFlow(flow *mitmflowv1.Flow) {
	httpFlow := flow.GetHttpFlow()
	if httpFlow == nil {
		return
	}
	extra := &mitmflowv1.HTTPFlowExtra{}

	var reqDesc, respDesc protoreflect.MessageDescriptor
	if s.registry != nil && httpFlow.HasRequest() {
		if u, err := url.Parse(httpFlow.GetRequest().GetUrl()); err == nil {
			reqDesc, respDesc, _ = s.registry.LookupMethod(u.Path)
		}
	}

	if httpFlow.HasRequest() {
		details := &mitmflowv1.MessageDetails{}
		s.preprocessRequest(httpFlow.GetRequest(), details, reqDesc)
		extra.SetRequest(details)
	}
	if httpFlow.HasResponse() {
		details := &mitmflowv1.MessageDetails{}
		s.preprocessResponse(httpFlow.GetResponse(), details, respDesc)
		extra.SetResponse(details)
	}
	flow.SetHttpFlowExtra(extra)
}

func (s *MITMFlowServer) preprocessRequest(req *mitmproxygrpcv1.Request, details *mitmflowv1.MessageDetails, msgDesc protoreflect.MessageDescriptor) {
	contentType, ok := getContentType(req.GetHeaders())
	if ok {
		details.SetEffectiveContentType(contentType)
	}
	if ct := mimetype.Detect(req.GetContent()); ct != nil {
		detectedContentType := ct.String()
		switch detectedContentType {
		case "text/plain", "application/octet-stream":
			// do not override common generic content types
		default:
			details.SetEffectiveContentType(detectedContentType)
		}
	}

	var dnsQuery string
	if u, err := url.Parse(req.GetUrl()); err == nil {
		if val, ok := u.Query()["dns"]; ok && len(val) > 0 {
			dnsQuery = val[0]
		}
	}

	switch {
	case strings.Contains(contentType, "application/proto"),
		strings.Contains(contentType, "application/protobuf"),
		strings.Contains(contentType, "application/x-protobuf"):
		// Use processProtobufMessage to attempt parsing with descriptor (if available) and fallback to protoscope
		frames := processProtobufMessage(req.GetContent(), msgDesc)
		details.SetTextualFrames(frames)
	case strings.Contains(contentType, "application/connect+proto"):
		frames, err := parseConnectStreamingFrames(req.GetContent(), msgDesc)
		if err == nil {
			details.SetTextualFrames(frames)
		} else {
			log.Printf("failed to parse connect+proto frames: %v", err)
		}
	case dnsQuery != "":
		// For DoH GET requests, the dns parameter is base64url-encoded.
		packet, err := base64.RawURLEncoding.DecodeString(dnsQuery)
		if err != nil {
			log.Printf("failed to decode DoH query param: %v", err)
		}
		frame, err := parseDnsPacket(packet)
		if err == nil {
			details.SetTextualFrames([]string{frame})
		}
	case strings.Contains(contentType, "application/dns-message"):
		frame, err := parseDnsPacket(req.GetContent())
		if err == nil {
			details.SetTextualFrames([]string{frame})
		}
	case strings.Contains(contentType, "application/grpc-web"):
		frames, err := parseGrpcWebFrames(req.GetContent(), nil, nil, msgDesc)
		if err == nil {
			details.SetTextualFrames(frames)
		} else {
			log.Printf("failed to parse grpc-web frames: %v", err)
		}
	case strings.Contains(contentType, "application/grpc"):
		frames, err := parseGrpcFrames(req.GetContent(), nil, msgDesc)
		if err == nil {
			details.SetTextualFrames(frames)
		} else {
			log.Printf("failed to parse grpc frames: %v", err)
		}
	}
}

func getContentType(headers map[string]string) (string, bool) {
	for k, v := range headers {
		if strings.ToLower(k) == "content-type" {
			return strings.ToLower(v), true
		}
	}
	return "", false
}

func (s *MITMFlowServer) preprocessResponse(resp *mitmproxygrpcv1.Response, details *mitmflowv1.MessageDetails, msgDesc protoreflect.MessageDescriptor) {
	contentType, ok := getContentType(resp.GetHeaders())
	if ok {
		details.SetEffectiveContentType(contentType)
	}
	if ct := mimetype.Detect(resp.GetContent()); ct != nil {
		detectedContentType := ct.String()
		switch detectedContentType {
		case "text/plain", "application/octet-stream":
			// do not override common generic content types
		default:
			details.SetEffectiveContentType(detectedContentType)
		}
	}

	switch {
	case strings.Contains(contentType, "application/proto"),
		strings.Contains(contentType, "application/protobuf"),
		strings.Contains(contentType, "application/x-protobuf"):
		frames := processProtobufMessage(resp.GetContent(), msgDesc)
		details.SetTextualFrames(frames)
	case strings.Contains(contentType, "application/connect+proto"):
		frames, err := parseConnectStreamingFrames(resp.GetContent(), msgDesc)
		if err == nil {
			details.SetTextualFrames(frames)
		} else {
			log.Printf("failed to parse connect+proto frames: %v", err)
		}
	case strings.Contains(contentType, "application/dns-message"):
		frame, err := parseDnsPacket(resp.GetContent())
		if err == nil {
			details.SetTextualFrames([]string{frame})
		}
	case strings.Contains(contentType, "application/grpc-web"):
		frames, err := parseGrpcWebFrames(resp.GetContent(), resp.GetHeaders(), resp.GetTrailers(), msgDesc)
		if err == nil {
			details.SetTextualFrames(frames)
		} else {
			log.Printf("failed to parse grpc-web frames: %v", err)
		}
	case strings.Contains(contentType, "application/grpc"):
		frames, err := parseGrpcFrames(resp.GetContent(), resp.GetTrailers(), msgDesc)
		if err == nil {
			details.SetTextualFrames(frames)
		} else {
			log.Printf("failed to parse grpc frames: %v", err)
		}
	}
}

func (s *MITMFlowServer) ExportFlows(
	ctx context.Context,
	req *connect.Request[mitmflowv1.ExportFlowsRequest],
) (*connect.Response[mitmflowv1.ExportFlowsResponse], error) {
	log.Printf("ExportFlows called with %d flow IDs, format: %v", len(req.Msg.GetFlowIds()), req.Msg.GetFormat())

	var filteredFlows []*mitmflowv1.Flow

	// If specific IDs are requested, filter by them
	if len(req.Msg.GetFlowIds()) > 0 {
		for _, id := range req.Msg.GetFlowIds() {
			if flow, ok := s.storage.GetFlow(id); ok {
				filteredFlows = append(filteredFlows, flow)
			}
		}
		sort.Slice(filteredFlows, func(i, j int) bool {
			return GetFlowStartTime(filteredFlows[i]) < GetFlowStartTime(filteredFlows[j])
		})
	} else {
		// If no IDs provided, return empty list or maybe error?
		// For now, let's assume empty list.
		// Or should we support "Export All" flag?
		// The prompt said "explicit list". So empty list = empty export.
	}

	var data []byte
	var filename string
	var err error

	switch req.Msg.GetFormat() {
	case mitmflowv1.ExportFormat_EXPORT_FORMAT_HAR:
		data, err = GenerateHAR(filteredFlows)
		filename = "flows.har"
	case mitmflowv1.ExportFormat_EXPORT_FORMAT_JSON:
		data, err = json.MarshalIndent(filteredFlows, "", "  ")
		filename = "flows.json"
	default:
		return nil, connect.NewError(connect.CodeInvalidArgument, fmt.Errorf("unsupported format: %v", req.Msg.GetFormat()))
	}

	if err != nil {
		log.Printf("Export generation failed: %v", err)
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	return connect.NewResponse(mitmflowv1.ExportFlowsResponse_builder{
		Data:     data,
		Filename: &filename,
	}.Build()), nil
}

func main() {
	flag.Parse()

	storage, err := NewFlowStorage(*dataDir, *maxFlows)
	if err != nil {
		log.Fatalf("failed to initialize storage: %v", err)
	}

	registry := NewRegistry()
	if len(descriptorFiles) > 0 {
		if err := registry.LoadFromFiles(descriptorFiles); err != nil {
			log.Fatalf("failed to load descriptor files: %v", err)
		}
	}

	server, err := NewMITMFlowServer(storage, registry)
	if err != nil {
		log.Fatalf("failed to initialize server: %v", err)
	}

	mux := http.NewServeMux()
	opts := []connect.HandlerOption{
		connect.WithInterceptors(validate.NewInterceptor()),
		connect.WithCompressMinBytes(1024), // Compress response messages larger than 1KB
	}
	mux.Handle(mitmflowv1.NewServiceHandler(server, opts...))
	mux.Handle(mitmproxygrpcv1.NewServiceHandler(server, opts...))

	log.Printf("Starting server on %s", *addr)

	fsys, err := fs.Sub(dist, "dist")
	if err != nil {
		log.Fatal(err)
	}
	staticHandler := http.FileServer(http.FS(fsys))

	// Serve index.html for root and HTML requests
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/" || r.URL.Path == "/index.html" {
			// Read the index.html file from the embedded filesystem
			indexHTML, err := fs.ReadFile(fsys, "index.html")
			if err != nil {
				http.Error(w, "index.html not found", http.StatusInternalServerError)
				return
			}

			// Inject configuration into the HTML
			// Use "." for relative URL so requests go relative to current page path
			config := `<script>window.MITMFLOW_GRPC_ADDR = ".";</script>`
			modifiedHTML := strings.Replace(
				string(indexHTML),
				"<!-- MITMFLOW_CONFIG -->",
				config,
				1,
			)

			// Serve the modified HTML
			w.Header().Set("Content-Type", "text/html")
			w.Write([]byte(modifiedHTML))
			return
		}

		// For all other paths, serve static files
		staticHandler.ServeHTTP(w, r)
	})

	c := cors.New(cors.Options{
		AllowedOrigins: []string{"http://localhost:5173"},
		AllowedMethods: []string{http.MethodPost},
		AllowedHeaders: []string{"*"},
	})

	handlerWithCors := c.Handler(h2c.NewHandler(mux, &http2.Server{}))

	err = http.ListenAndServe(
		*addr,
		// Use h2c so we can serve HTTP/2 without TLS.
		handlerWithCors,
	)
	if err != nil {
		log.Fatalf("failed to serve: %v", err)
	}
}
