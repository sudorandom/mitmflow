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

	"os"

	"connectrpc.com/connect"
	"github.com/google/uuid"
	"github.com/protocolbuffers/protoscope"
	"github.com/rs/cors"
	"golang.org/x/net/http2"
	"golang.org/x/net/http2/h2c"
	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/reflect/protodesc"
	"google.golang.org/protobuf/types/descriptorpb"

	mitmflowv1 "github.com/sudorandom/mitmflow/gen/go/mitmflow/v1"
)

//go:embed all:dist
var dist embed.FS

var (
	descriptorSetPaths = flag.String("descriptor-set-paths", "", "Comma-separated paths to protobuf descriptor sets")
)

type MITMFlowServer struct {
	subscribers map[string]chan *mitmflowv1.Flow

	mu sync.RWMutex

	files protodesc.Resolver
}

func NewMITMFlowServer(files protodesc.Resolver) *MITMFlowServer {
	return &MITMFlowServer{
		subscribers: make(map[string]chan *mitmflowv1.Flow),
		files:       files,
	}

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
	contentType, ok := req.Headers["content-type"]
	if !ok {
		contentType, ok = req.Headers["Content-Type"]
	}
	if !ok {
		return
	}

	if strings.Contains(contentType, "application/proto") {
		opts := protoscope.WriterOptions{}
		protoscopeOutput := protoscope.Write(req.Content, opts)
		req.ContentProtoscopeFrames = []string{protoscopeOutput}
	} else if strings.Contains(contentType, "application/grpc") {
		frames, err := parseGrpcFrames(req.Content, req.Url)
		if err == nil {
			req.ContentProtoscopeFrames = frames
		}
	}

	switch {
	case strings.Contains(contentType, "application/proto") || strings.Contains(contentType, "application/protobuf"):
		opts := protoscope.WriterOptions{}
		protoscopeOutput := protoscope.Write(req.Content, opts)
		req.ContentProtoscopeFrames = []string{protoscopeOutput}
	case strings.Contains(contentType, "application/grpc"):
		frames, err := parseGrpcFrames(req.Content, "")
		if err == nil {
			req.ContentProtoscopeFrames = frames
		}
	case strings.Contains(contentType, "application/grpc-web"):
		frames, err := parseGrpcWebFrames(req.Content, "")
		if err == nil {
			req.ContentProtoscopeFrames = frames
		}
	}
}

func (s *MITMFlowServer) preprocessResponse(resp *mitmflowv1.Response) {
	contentType, ok := resp.Headers["content-type"]
	if !ok {
		contentType, ok = resp.Headers["Content-Type"]
	}
	if !ok {
		return
	}

	switch {
	case strings.Contains(contentType, "application/proto") || strings.Contains(contentType, "application/protobuf"):
		opts := protoscope.WriterOptions{}
		protoscopeOutput := protoscope.Write(resp.Content, opts)
		resp.ContentProtoscopeFrames = []string{protoscopeOutput}
	case strings.Contains(contentType, "application/grpc"):
		frames, err := parseGrpcFrames(resp.Content, "")
		if err == nil {
			resp.ContentProtoscopeFrames = frames
		}
	case strings.Contains(contentType, "application/grpc-web"):
		frames, err := parseGrpcWebFrames(resp.Content, "")
		if err == nil {
			resp.ContentProtoscopeFrames = frames
		}
	}
}

func loadSchema(descriptorSetPaths string) (protodesc.Resolver, error) {
	if descriptorSetPaths == "" {
		return nil, nil
	}

	var fds descriptorpb.FileDescriptorSet
	for path := range strings.SplitSeq(descriptorSetPaths, ",") {
		b, err := os.ReadFile(path)
		if err != nil {
			return nil, fmt.Errorf("failed to read descriptor set file: %w", err)
		}
		var set descriptorpb.FileDescriptorSet
		if err := proto.Unmarshal(b, &set); err != nil {
			return nil, fmt.Errorf("failed to unmarshal descriptor set: %w", err)
		}
		fds.File = append(fds.File, set.File...)
	}

	files, err := protodesc.NewFiles(&fds)
	if err != nil {
		return nil, fmt.Errorf("failed to create new files: %w", err)
	}

	return files, nil
}

func main() {
	flag.Parse()
	files, err := loadSchema(*descriptorSetPaths)
	if err != nil {
		log.Fatalf("failed to load schema: %v", err)
	}
	mux := http.NewServeMux()
	server := NewMITMFlowServer(files)
	path, handler := mitmflowv1.NewServiceHandler(server)
	mux.Handle(path, handler)

	fsys, err := fs.Sub(dist, "dist")
	if err != nil {
		log.Fatal(err)
	}
	staticHandler := http.FileServer(http.FS(fsys))
	mux.Handle("/", staticHandler)

	addr := "127.0.0.1:50051"
	log.Printf("Starting server on %s", addr)

	c := cors.New(cors.Options{
		AllowedOrigins: []string{"http://localhost:5173"},
		AllowedMethods: []string{http.MethodPost},
		AllowedHeaders: []string{"*"},
	})

	handlerWithCors := c.Handler(h2c.NewHandler(mux, &http2.Server{}))

	err = http.ListenAndServe(
		addr,
		// Use h2c so we can serve HTTP/2 without TLS.
		handlerWithCors,
	)
	if err != nil {
		log.Fatalf("failed to serve: %v", err)
	}
}
