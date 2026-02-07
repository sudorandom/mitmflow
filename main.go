package main

import (
	"context"
	"embed"
	"encoding/base64"
	"flag"
	"fmt"
	"io/fs"
	"log"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"connectrpc.com/connect"
	"connectrpc.com/validate"
	"github.com/gabriel-vasile/mimetype"
	"github.com/google/uuid"
	"github.com/protocolbuffers/protoscope"
	"github.com/rs/cors"
	"golang.org/x/net/http2"
	"golang.org/x/net/http2/h2c"
	"google.golang.org/protobuf/proto"

	mitmflowv1 "github.com/sudorandom/mitmflow/gen/go/mitmflow/v1"
	mitmproxygrpcv1 "github.com/sudorandom/mitmflow/gen/go/mitmproxygrpc/v1"
)

//go:embed all:dist
var dist embed.FS

var (
	addr     = flag.String("addr", "127.0.0.1:50051", "Address to listen on")
	dataDir  = flag.String("data-dir", "mitmflow_data", "Directory to store flow data")
	maxFlows = flag.Int("max-flows", 500, "Maximum number of unpinned flows to keep")
)

type MITMFlowServer struct {
	subscribers map[string]chan *mitmflowv1.Flow
	mu          sync.RWMutex
	storage     *FlowStorage
}

func NewMITMFlowServer(storage *FlowStorage) (*MITMFlowServer, error) {
	return &MITMFlowServer{
		subscribers: make(map[string]chan *mitmflowv1.Flow),
		storage:     storage,
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

func (s *MITMFlowServer) GetFlows(
	ctx context.Context,
	req *connect.Request[mitmflowv1.GetFlowsRequest],
	stream *connect.ServerStream[mitmflowv1.GetFlowsResponse],
) error {
	flows := s.storage.GetFlows()

	// Reverse iteration (newest first)
	limit := int(req.Msg.GetLimit())
	if limit <= 0 {
		limit = 500
	}

	count := 0
	filter := req.Msg.GetFilter()

	sendFlow := func(flow *mitmflowv1.Flow) error {
		builder := mitmflowv1.GetFlowsResponse_builder{
			Flow: flow,
		}
		return stream.Send(builder.Build())
	}

	// We collect matching flows first to handle sorting correctly if needed?
	// Actually, if we want "newest first" (reverse_order=true, which is typical for logs),
	// we can just iterate backwards and stream.
	// If we want "oldest first", but only the "last X flows", we still need to find the *last X* first.
	// Typically logs are "show me the last 500 flows".
	// If reverse_order=false (oldest first), we usually want the *first* 500 flows?
	// Or do we want the last 500 flows, but sorted oldest->newest?
	// The prompt said: "backend can only send the last X number of flows matching the filter".
	// This usually implies "Limit applied to the set of flows, effectively taking the N most recent".
	// The sorting order (reverse_order) determines how they are presented.

	// So: Find N most recent matching flows.
	// Then: Send them in requested order.

	for i := len(flows) - 1; i >= 0; i-- {
		flow := flows[i]
		if matchFlow(flow, filter) {
			if err := sendFlow(flow); err != nil {
				return err
			}
			count++
			if count >= limit {
				break
			}
		}
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
		builder := mitmflowv1.StreamFlowsResponse_builder{
			Flow: flow,
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
		flows := s.storage.GetFlows()
		// Iterate backwards (newest first) until we hit sinceNs
		for i := len(flows) - 1; i >= 0; i-- {
			// Periodically check context and drain channel
			if i%10 == 0 {
				if ctx.Err() != nil {
					return nil
				}
				if err := drainChannel(); err != nil {
					return err
				}
			}

			flow := flows[i]
			if GetFlowStartTime(flow) <= sinceNs {
				// Since flows are sorted by time (mostly), we can stop early?
				// Actually storage.sortedFlows implies they are sorted.
				// If we iterate backwards (newest to oldest), once we hit a flow <= sinceNs,
				// all subsequent flows (older) will also be <= sinceNs.
				// So we can break.
				break
			}
			if !matchFlow(flow, filter) {
				continue
			}
			if err := sendFlow(flow); err != nil {
				return err
			}
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

	return connect.NewResponse(mitmflowv1.UpdateFlowResponse_builder{Flow: flow}.Build()), nil
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
	if httpFlow.HasRequest() {
		details := &mitmflowv1.MessageDetails{}
		s.preprocessRequest(httpFlow.GetRequest(), details)
		extra.SetRequest(details)
	}
	if httpFlow.HasResponse() {
		details := &mitmflowv1.MessageDetails{}
		s.preprocessResponse(httpFlow.GetResponse(), details)
		extra.SetResponse(details)
	}
	flow.SetHttpFlowExtra(extra)
}

func (s *MITMFlowServer) preprocessRequest(req *mitmproxygrpcv1.Request, details *mitmflowv1.MessageDetails) {
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
		opts := protoscope.WriterOptions{}
		protoscopeOutput := protoscope.Write(req.GetContent(), opts)
		details.SetTextualFrames([]string{protoscopeOutput})
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
		frames, err := parseGrpcWebFrames(req.GetContent(), nil, nil)
		if err == nil {
			details.SetTextualFrames(frames)
		} else {
			log.Printf("failed to parse grpc-web frames: %v", err)
		}
	case strings.Contains(contentType, "application/grpc"):
		frames, err := parseGrpcFrames(req.GetContent(), nil)
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

func (s *MITMFlowServer) preprocessResponse(resp *mitmproxygrpcv1.Response, details *mitmflowv1.MessageDetails) {
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
		opts := protoscope.WriterOptions{}
		protoscopeOutput := protoscope.Write(resp.GetContent(), opts)
		details.SetTextualFrames([]string{protoscopeOutput})
	case strings.Contains(contentType, "application/dns-message"):
		frame, err := parseDnsPacket(resp.GetContent())
		if err == nil {
			details.SetTextualFrames([]string{frame})
		}
	case strings.Contains(contentType, "application/grpc-web"):
		frames, err := parseGrpcWebFrames(resp.GetContent(), resp.GetHeaders(), resp.GetTrailers())
		if err == nil {
			details.SetTextualFrames(frames)
		} else {
			log.Printf("failed to parse grpc-web frames: %v", err)
		}
	case strings.Contains(contentType, "application/grpc"):
		frames, err := parseGrpcFrames(resp.GetContent(), resp.GetTrailers())
		if err == nil {
			details.SetTextualFrames(frames)
		} else {
			log.Printf("failed to parse grpc frames: %v", err)
		}
	}
}

func main() {
	flag.Parse()

	storage, err := NewFlowStorage(*dataDir, *maxFlows)
	if err != nil {
		log.Fatalf("failed to initialize storage: %v", err)
	}

	server, err := NewMITMFlowServer(storage)
	if err != nil {
		log.Fatalf("failed to initialize server: %v", err)
	}

	mux := http.NewServeMux()
	interceptors := connect.WithInterceptors(validate.NewInterceptor())
	mux.Handle(mitmflowv1.NewServiceHandler(server, interceptors))
	mux.Handle(mitmproxygrpcv1.NewServiceHandler(server, interceptors))

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
