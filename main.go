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
	"github.com/google/uuid"
	"github.com/protocolbuffers/protoscope"
	"github.com/rs/cors"
	"golang.org/x/net/http2"
	"golang.org/x/net/http2/h2c"

	mitmflowv1 "github.com/sudorandom/mitmflow/gen/go/mitmflow/v1"
)

//go:embed all:dist
var dist embed.FS

var (
	addr = flag.String("addr", "127.0.0.1:50051", "Address to listen on")
)

type MITMFlowServer struct {
	subscribers map[string]chan *mitmflowv1.Flow
	mu          sync.RWMutex
}

func NewMITMFlowServer() *MITMFlowServer {
	return &MITMFlowServer{subscribers: make(map[string]chan *mitmflowv1.Flow)}

}

func (s *MITMFlowServer) ExportFlow(
	ctx context.Context,
	stream *connect.ClientStream[mitmflowv1.ExportFlowRequest],
) (*connect.Response[mitmflowv1.ExportFlowResponse], error) {
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
	res := &connect.Response[mitmflowv1.ExportFlowResponse]{
		Msg: &mitmflowv1.ExportFlowResponse{
			Message:        fmt.Sprintf("Received %d flows", flowCount),
			Received:       true,
			FlowsProcessed: flowCount,
		},
	}
	return res, nil
}

func (s *MITMFlowServer) StreamFlows(
	ctx context.Context,
	req *connect.Request[mitmflowv1.StreamFlowsRequest],
	stream *connect.ServerStream[mitmflowv1.StreamFlowsResponse],
) error {
	ch := make(chan *mitmflowv1.Flow, 50)
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
			if err := stream.Send(&mitmflowv1.StreamFlowsResponse{Flow: flow}); err != nil {
				return err
			}
		}
	}
}

func (s *MITMFlowServer) preprocessFlow(flow *mitmflowv1.Flow) {
	httpFlow := flow.GetHttpFlow()
	if httpFlow == nil {
		return
	}
	if httpFlow.Request != nil {
		s.preprocessRequest(httpFlow.Request)
	}
	if httpFlow.Response != nil {
		s.preprocessResponse(httpFlow.Response)
	}
}

func (s *MITMFlowServer) preprocessRequest(req *mitmflowv1.Request) {
	contentType, ok := getContentType(req.Headers)
	if ok {
		req.EffectiveContentType = contentType
	}
	if ct := http.DetectContentType(req.Content); ct != "application/octet-stream" && !strings.HasPrefix(ct, "text/plain") {
		req.EffectiveContentType = ct
	}

	switch {
	case strings.Contains(contentType, "application/proto"),
		strings.Contains(contentType, "application/protobuf"),
		strings.Contains(contentType, "application/x-protobuf"):
		opts := protoscope.WriterOptions{}
		protoscopeOutput := protoscope.Write(req.Content, opts)
		req.ContentProtoscopeFrames = []string{protoscopeOutput}
	case strings.Contains(contentType, "application/grpc-web"):
		frames, err := parseGrpcWebFrames(req.Content, nil, nil)
		if err == nil {
			req.ContentProtoscopeFrames = frames
		} else {
			log.Printf("failed to parse grpc-web frames: %v", err)
		}
	case strings.Contains(contentType, "application/grpc"):
		frames, err := parseGrpcFrames(req.Content, nil)
		if err == nil {
			req.ContentProtoscopeFrames = frames
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

func (s *MITMFlowServer) preprocessResponse(resp *mitmflowv1.Response) {
	contentType, ok := getContentType(resp.Headers)
	if ok {
		resp.EffectiveContentType = contentType
	}
	if ct := http.DetectContentType(resp.Content); ct != "application/octet-stream" && !strings.HasPrefix(ct, "text/plain") {
		resp.EffectiveContentType = ct
	}

	switch {
	case strings.Contains(contentType, "application/proto"),
		strings.Contains(contentType, "application/protobuf"),
		strings.Contains(contentType, "application/x-protobuf"):
		opts := protoscope.WriterOptions{}
		protoscopeOutput := protoscope.Write(resp.Content, opts)
		resp.ContentProtoscopeFrames = []string{protoscopeOutput}
	case strings.Contains(contentType, "application/grpc-web"):
		frames, err := parseGrpcWebFrames(resp.Content, resp.Headers, resp.Trailers)
		if err == nil {
			resp.ContentProtoscopeFrames = frames
		} else {
			log.Printf("failed to parse grpc-web frames: %v", err)
		}
	case strings.Contains(contentType, "application/grpc"):
		frames, err := parseGrpcFrames(resp.Content, resp.Trailers)
		if err == nil {
			resp.ContentProtoscopeFrames = frames
		} else {
			log.Printf("failed to parse grpc frames: %v", err)
		}
	}
}

func main() {
	flag.Parse()
	mux := http.NewServeMux()
	server := NewMITMFlowServer()
	path, handler := mitmflowv1.NewServiceHandler(server)
	mux.Handle(path, handler)

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
