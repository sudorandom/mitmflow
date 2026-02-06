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
	"strconv"
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

	flows := s.storage.GetFlows()
	sinceNs := req.Msg.GetSinceTimestampNs()

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
				if !matchFlow(flow, req.Msg) {
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

	if req.Msg.GetReverseOrder() {
		// Iterate backwards
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
			if sinceNs > 0 && GetFlowStartTime(flow) <= sinceNs {
				continue
			}
			if !matchFlow(flow, req.Msg) {
				continue
			}
			if err := sendFlow(flow); err != nil {
				return err
			}
		}
	} else {
		for i, flow := range flows {
			// Periodically check context and drain channel
			if i%10 == 0 {
				if ctx.Err() != nil {
					return nil
				}
				if err := drainChannel(); err != nil {
					return err
				}
			}

			if sinceNs > 0 && GetFlowStartTime(flow) <= sinceNs {
				continue
			}
			if !matchFlow(flow, req.Msg) {
				continue
			}
			if err := sendFlow(flow); err != nil {
				return err
			}
		}
	}

	// Ensure any remaining flows in channel are sent before sending HISTORY_DONE
	if err := drainChannel(); err != nil {
		return err
	}

	// Send HISTORY_DONE event
	eventType := mitmflowv1.StreamEvent_TYPE_HISTORY_DONE
	event := mitmflowv1.StreamEvent_builder{
		Type: &eventType,
	}.Build()
	eventBuilder := mitmflowv1.StreamFlowsResponse_builder{
		Event: event,
	}
	err := stream.Send(eventBuilder.Build())
	if err != nil {
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
			if !matchFlow(flow, req.Msg) {
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

func matchFlow(flow *mitmflowv1.Flow, filter *mitmflowv1.StreamFlowsRequest) bool {
	if filter.GetPinnedOnly() && !flow.GetPinned() {
		return false
	}
	if filter.GetHasNote() && flow.GetNote() == "" {
		return false
	}

	// Text Filter
	filterText := strings.ToLower(filter.GetFilterText())
	if filterText != "" {
		isMatch := false
		var clientIp, serverIp string
		var note string = flow.GetNote()

		if f := flow.GetHttpFlow(); f != nil {
			clientIp = f.GetClient().GetPeernameHost()
			serverIp = f.GetServer().GetAddressHost()
		} else if f := flow.GetTcpFlow(); f != nil {
			clientIp = f.GetClient().GetPeernameHost()
			serverIp = f.GetServer().GetAddressHost()
		} else if f := flow.GetUdpFlow(); f != nil {
			clientIp = f.GetClient().GetPeernameHost()
			serverIp = f.GetServer().GetAddressHost()
		} else if f := flow.GetDnsFlow(); f != nil {
			clientIp = f.GetClient().GetPeernameHost()
			serverIp = f.GetServer().GetAddressHost()
		}

		commonMatch := strings.Contains(strings.ToLower(clientIp), filterText) ||
			strings.Contains(strings.ToLower(serverIp), filterText) ||
			strings.Contains(strings.ToLower(note), filterText)

		if commonMatch {
			isMatch = true
		} else {
			if f := flow.GetHttpFlow(); f != nil {
				url := f.GetRequest().GetPrettyUrl()
				if url == "" {
					url = f.GetRequest().GetUrl()
				}
				method := f.GetRequest().GetMethod()
				statusCode := f.GetResponse().GetStatusCode()
				sni := f.GetClient().GetSni()

				metaText := strings.ToLower(fmt.Sprintf("%s %s %d %s", url, method, statusCode, sni))
				if strings.Contains(metaText, filterText) {
					isMatch = true
				} else {
					// Body check
					// Check textual frames
					if hasText(flow.GetHttpFlowExtra().GetRequest().GetTextualFrames(), filterText) {
						isMatch = true
					} else if hasText(flow.GetHttpFlowExtra().GetResponse().GetTextualFrames(), filterText) {
						isMatch = true
					} else {
						// Content check
						// Simple check on raw bytes as string
						if strings.Contains(strings.ToLower(string(f.GetRequest().GetContent())), filterText) {
							isMatch = true
						} else if strings.Contains(strings.ToLower(string(f.GetResponse().GetContent())), filterText) {
							isMatch = true
						}
						// Websocket messages
						for _, msg := range f.GetWebsocketMessages() {
							if strings.Contains(strings.ToLower(string(msg.GetContent())), filterText) {
								isMatch = true
								break
							}
						}
					}
				}
			} else if f := flow.GetDnsFlow(); f != nil {
				if len(f.GetRequest().GetQuestions()) > 0 {
					name := f.GetRequest().GetQuestions()[0].GetName()
					if strings.Contains(strings.ToLower(name), filterText) {
						isMatch = true
					}
				}
			} else if f := flow.GetTcpFlow(); f != nil {
				server := f.GetServer()
				text := strings.ToLower(fmt.Sprintf("%s:%d", server.GetAddressHost(), server.GetAddressPort()))
				if strings.Contains(text, filterText) {
					isMatch = true
				}
			} else if f := flow.GetUdpFlow(); f != nil {
				server := f.GetServer()
				text := strings.ToLower(fmt.Sprintf("%s:%d", server.GetAddressHost(), server.GetAddressPort()))
				if strings.Contains(text, filterText) {
					isMatch = true
				}
			}
		}
		if !isMatch {
			return false
		}
	}

	// Client IP Filter
	if len(filter.GetClientIps()) > 0 {
		var clientIp string
		if f := flow.GetHttpFlow(); f != nil {
			clientIp = f.GetClient().GetPeernameHost()
		} else if f := flow.GetTcpFlow(); f != nil {
			clientIp = f.GetClient().GetPeernameHost()
		} else if f := flow.GetUdpFlow(); f != nil {
			clientIp = f.GetClient().GetPeernameHost()
		} else if f := flow.GetDnsFlow(); f != nil {
			clientIp = f.GetClient().GetPeernameHost()
		}

		found := false
		for _, ip := range filter.GetClientIps() {
			if ip == clientIp {
				found = true
				break
			}
		}
		if !found {
			return false
		}
	}

	// Flow Type Filter
	if len(filter.GetFlowTypes()) > 0 {
		var flowType string
		isDnsMessage := false

		if f := flow.GetHttpFlow(); f != nil {
			reqCt := flow.GetHttpFlowExtra().GetRequest().GetEffectiveContentType()
			resCt := flow.GetHttpFlowExtra().GetResponse().GetEffectiveContentType()
			if reqCt == "application/dns-message" || resCt == "application/dns-message" {
				isDnsMessage = true
			}
			flowType = "http"
		} else if flow.GetTcpFlow() != nil {
			flowType = "tcp"
		} else if flow.GetUdpFlow() != nil {
			flowType = "udp"
		} else if flow.GetDnsFlow() != nil {
			flowType = "dns"
		}

		if isDnsMessage {
			flowType = "dns"
		}

		found := false
		for _, t := range filter.GetFlowTypes() {
			if t == flowType {
				found = true
				break
			}
		}
		if !found {
			return false
		}
	}

	// HTTP Specific Filters
	if filter.GetHttp() != nil {
		httpFlow := flow.GetHttpFlow()
		if httpFlow == nil {
			// If we have HTTP filters but it's not an HTTP flow, it shouldn't match?
			// Usually yes, unless we treat filters as OR? But usually it is AND.
			// But if flowType didn't filter it out, maybe we shouldn't apply http filters to non-http?
			// However, if I ask for "method=GET", I probably don't want TCP flows.
			return false
		}
		httpFilter := filter.GetHttp()

		// Method
		if len(httpFilter.GetMethods()) > 0 {
			found := false
			method := httpFlow.GetRequest().GetMethod()
			for _, m := range httpFilter.GetMethods() {
				if m == method {
					found = true
					break
				}
			}
			if !found {
				return false
			}
		}

		// Status Codes
		if len(httpFilter.GetStatusCodes()) > 0 {
			statusCode := int(httpFlow.GetResponse().GetStatusCode())
			found := false
			for _, sc := range httpFilter.GetStatusCodes() {
				if strings.HasSuffix(sc, "xx") {
					prefix := sc[:1]
					if strings.HasPrefix(strconv.Itoa(statusCode), prefix) {
						found = true
						break
					}
				} else if strings.Contains(sc, "-") {
					parts := strings.Split(sc, "-")
					if len(parts) == 2 {
						start, _ := strconv.Atoi(parts[0])
						end, _ := strconv.Atoi(parts[1])
						if statusCode >= start && statusCode <= end {
							found = true
							break
						}
					}
				} else {
					code, _ := strconv.Atoi(sc)
					if statusCode == code {
						found = true
						break
					}
				}
			}
			if !found {
				return false
			}
		}

		// Content Types
		if len(httpFilter.GetContentTypes()) > 0 {
			reqCt := flow.GetHttpFlowExtra().GetRequest().GetEffectiveContentType()
			resCt := flow.GetHttpFlowExtra().GetResponse().GetEffectiveContentType()
			found := false
			for _, ct := range httpFilter.GetContentTypes() {
				if strings.Contains(reqCt, ct) || strings.Contains(resCt, ct) {
					found = true
					break
				}
			}
			if !found {
				return false
			}
		}
	}

	return true
}

func hasText(list []string, sub string) bool {
	for _, s := range list {
		if strings.Contains(strings.ToLower(s), sub) {
			return true
		}
	}
	return false
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
