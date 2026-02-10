package main

import (
	"fmt"
	"os"
	"strings"

	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/reflect/protodesc"
	"google.golang.org/protobuf/reflect/protoreflect"
	"google.golang.org/protobuf/reflect/protoregistry"
	"google.golang.org/protobuf/types/descriptorpb"
)

type Registry struct {
	files *protoregistry.Files
}

func NewRegistry() *Registry {
	return &Registry{}
}

func (r *Registry) LoadFromFiles(paths []string) error {
	var allFiles []*descriptorpb.FileDescriptorProto

	for _, path := range paths {
		content, err := os.ReadFile(path)
		if err != nil {
			return fmt.Errorf("failed to read descriptor file %s: %w", path, err)
		}

		// descriptor set is just a list of FileDescriptorProto
		fds := &descriptorpb.FileDescriptorSet{}
		if err := proto.Unmarshal(content, fds); err != nil {
			return fmt.Errorf("failed to unmarshal descriptor file %s: %w", path, err)
		}

		allFiles = append(allFiles, fds.File...)
	}

	if len(allFiles) == 0 {
		return nil
	}

	files, err := protodesc.NewFiles(&descriptorpb.FileDescriptorSet{File: allFiles})
	if err != nil {
		return fmt.Errorf("failed to create registry from files: %w", err)
	}

	r.files = files
	return nil
}

// LookupMethod resolves a gRPC path (e.g. "/package.Service/Method") to input and output message descriptors.
func (r *Registry) LookupMethod(path string) (protoreflect.MessageDescriptor, protoreflect.MessageDescriptor, error) {
	if r.files == nil {
		return nil, nil, fmt.Errorf("registry not initialized")
	}

	parts := strings.Split(path, "/")
	// We need at least 3 parts: "" (empty string before first slash), "Service", "Method"
	// or just "Service", "Method" if no leading slash?
	// Usually paths start with /, so split results in ["", "Service", "Method"].
	// If path is "Service/Method", split results in ["Service", "Method"].
	
	// Filter out empty strings to handle multiple slashes or leading/trailing slashes
	var segments []string
	for _, p := range parts {
		if p != "" {
			segments = append(segments, p)
		}
	}

	if len(segments) < 2 {
		return nil, nil, fmt.Errorf("invalid grpc path: %s", path)
	}

	serviceName := segments[len(segments)-2]
	methodName := segments[len(segments)-1]

	desc, err := r.files.FindDescriptorByName(protoreflect.FullName(serviceName))
	if err != nil {
		return nil, nil, fmt.Errorf("service not found: %s", serviceName)
	}

	serviceDesc, ok := desc.(protoreflect.ServiceDescriptor)
	if !ok {
		return nil, nil, fmt.Errorf("found descriptor is not a service: %s", serviceName)
	}

	methodDesc := serviceDesc.Methods().ByName(protoreflect.Name(methodName))
	if methodDesc == nil {
		return nil, nil, fmt.Errorf("method %s not found in service %s", methodName, serviceName)
	}

	return methodDesc.Input(), methodDesc.Output(), nil
}
