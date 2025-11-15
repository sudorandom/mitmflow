package main

import (
	"context"
	"embed"
	"flag"
	"fmt"
	"io/fs"
	"log"
	"net/http"
	"strings"
	"sync"

	"connectrpc.com/connect"
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
	addr = flag.String("addr", "127.0.0.1:50051", "Address to listen on")
)

type MITMFlowServer struct {
	subscribers map[string]chan *mitmproxygrpcv1.Flow
	mu          sync.RWMutex
}

func NewMITMFlowServer() *MITMFlowServer {
	return &MITMFlowServer{subscribers: make(map[string]chan *mitmproxygrpcv1.Flow)}

}

func (s *MITMFlowServer) ExportFlow(
	ctx context.Context,
	stream *connect.ClientStream[mitmproxygrpcv1.ExportFlowRequest],
) (*connect.Response[mitmproxygrpcv1.ExportFlowResponse], error) {
	var flowCount uint64
	for stream.Receive() {
		flowCount++
		req := stream.Msg()
		s.preprocessFlow(req.GetFlow())
		s.mu.RLock()
		for _, ch := range s.subscribers {
			select {
			case ch <- req.GetFlow():
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
	ch := make(chan *mitmproxygrpcv1.Flow, 50)
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

	for {
		select {
		case <-ctx.Done():
			return nil
		case flow := <-ch:
			if err := stream.Send(mitmflowv1.StreamFlowsResponse_builder{Flow: flow}.Build()); err != nil {
				return err
			}
		}
	}
}

func (s *MITMFlowServer) preprocessFlow(flow *mitmproxygrpcv1.Flow) {
	httpFlow := flow.GetHttpFlow()
	if httpFlow == nil {
		return
	}
	if httpFlow.HasRequest() {
		s.preprocessRequest(httpFlow.GetRequest())
	}
	if httpFlow.HasResponse() {
		s.preprocessResponse(httpFlow.GetResponse())
	}
}

func (s *MITMFlowServer) preprocessRequest(req *mitmproxygrpcv1.Request) {
	details := proto.GetExtension(req, mitmflowv1.E_RequestDetails).(*mitmflowv1.MessageDetails)
	if details == nil {
		details = &mitmflowv1.MessageDetails{}
	}

	contentType, ok := getContentType(req.GetHeaders())
	if ok {
		details.SetEffectiveContentType(contentType)
	}
	if ct := mimetype.Detect(req.GetContent()); ct != nil {
		details.SetEffectiveContentType(ct.String())
	}

	switch {
	case strings.Contains(contentType, "application/proto"),
		strings.Contains(contentType, "application/protobuf"),
		strings.Contains(contentType, "application/x-protobuf"):
		opts := protoscope.WriterOptions{}
		protoscopeOutput := protoscope.Write(req.GetContent(), opts)
		details.SetTextualFrames([]string{protoscopeOutput})
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
	proto.SetExtension(req, mitmflowv1.E_RequestDetails, details)
}

func getContentType(headers map[string]string) (string, bool) {
	for k, v := range headers {
		if strings.ToLower(k) == "content-type" {
			return strings.ToLower(v), true
		}
	}
	return "", false
}

func (s *MITMFlowServer) preprocessResponse(resp *mitmproxygrpcv1.Response) {
	details := proto.GetExtension(resp, mitmflowv1.E_ResponseDetails).(*mitmflowv1.MessageDetails)
	if details == nil {
		details = &mitmflowv1.MessageDetails{}
	}

	contentType, ok := getContentType(resp.GetHeaders())
	if ok {
		details.SetEffectiveContentType(contentType)
	}
	if ct := mimetype.Detect(resp.GetContent()); ct != nil {
		details.SetEffectiveContentType(ct.String())
	}

	switch {
	case strings.Contains(contentType, "application/proto"),
		strings.Contains(contentType, "application/protobuf"),
		strings.Contains(contentType, "application/x-protobuf"):
		opts := protoscope.WriterOptions{}
		protoscopeOutput := protoscope.Write(resp.GetContent(), opts)
		details.SetTextualFrames([]string{protoscopeOutput})
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
	proto.SetExtension(resp, mitmflowv1.E_ResponseDetails, details)
}

func main() {
	flag.Parse()
	mux := http.NewServeMux()
	server := NewMITMFlowServer()
	mux.Handle(mitmflowv1.NewServiceHandler(server))
	mux.Handle(mitmproxygrpcv1.NewServiceHandler(server))

	log.Printf("Starting server on %s", *addr)

	fsys, err := fs.Sub(dist, "dist")
	if err != nil {
		log.Fatal(err)
	}
	staticHandler := http.FileServer(http.FS(fsys))

	// Handle the root path separately to inject the server address
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/" || r.URL.Path == "/index.html" {
			// Read the index.html file from the embedded filesystem
			indexHTML, err := fs.ReadFile(fsys, "index.html")
			if err != nil {
				http.Error(w, "index.html not found", http.StatusInternalServerError)
				return
			}

			// Inject the server address into the HTML
			config := fmt.Sprintf(`<script>window.MITMFLOW_GRPC_ADDR = "http://%s";</script>`, *addr)
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
