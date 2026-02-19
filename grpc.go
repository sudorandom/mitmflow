package main

import (
	"bytes"
	"compress/gzip"
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"io"

	"github.com/protocolbuffers/protoscope"
	_ "google.golang.org/genproto/googleapis/rpc/errdetails"
	statuspb "google.golang.org/genproto/googleapis/rpc/status"
	"google.golang.org/protobuf/encoding/protojson"
	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/reflect/protoreflect"
	"google.golang.org/protobuf/types/dynamicpb"
)

const (
	MaxTextualFrames    = 50
	MaxTextualFrameSize = 50 * 1024 // 50KB
)

func processProtobufMessage(message []byte, msgDesc protoreflect.MessageDescriptor) []string {
	var frames []string
	if msgDesc != nil {
		msg := dynamicpb.NewMessage(msgDesc)
		if err := proto.Unmarshal(message, msg); err == nil {
			opts := protojson.MarshalOptions{
				EmitUnpopulated: true,
				Indent:          "  ",
			}
			if jsonBytes, err := opts.Marshal(msg); err == nil {
				if len(jsonBytes) > MaxTextualFrameSize {
					frames = append(frames, fmt.Sprintf("Message too large to display (%d bytes)", len(jsonBytes)))
				} else {
					frames = append(frames, string(jsonBytes))
				}
				return frames
			}
		}
	}
	opts := protoscope.WriterOptions{}
	protoscopeOutput := protoscope.Write(message, opts)
	if len(protoscopeOutput) > MaxTextualFrameSize {
		frames = append(frames, fmt.Sprintf("Message too large to display (%d bytes)", len(protoscopeOutput)))
	} else {
		frames = append(frames, protoscopeOutput)
	}
	return frames
}

func parseGrpcFrames(content []byte, trailers map[string]string, msgDesc protoreflect.MessageDescriptor) ([]string, error) {
	// For grpc messages, if there is not enough content for a full frame, we should
	// emit a ContentProtoscopeFrames with an empty string.
	if len(content) < 5 {
		return []string{""}, nil
	}
	var frames []string
	buf := bytes.NewBuffer(content)
	for buf.Len() >= 5 {
		prefix := make([]byte, 5)
		if _, err := io.ReadFull(buf, prefix); err != nil {
			return nil, err
		}
		compressed := prefix[0] == 1
		length := binary.BigEndian.Uint32(prefix[1:])

		if buf.Len() < int(length) {
			return nil, fmt.Errorf("incomplete grpc frame")
		}

		message := make([]byte, length)
		if _, err := io.ReadFull(buf, message); err != nil {
			return nil, err
		}

		if compressed {
			gr, err := gzip.NewReader(bytes.NewBuffer(message))
			if err != nil {
				return nil, fmt.Errorf("failed to create gzip reader: %w", err)
			}
			defer gr.Close() //nolint:errcheck
			message, err = io.ReadAll(gr)
			if err != nil {
				return nil, fmt.Errorf("failed to decompress message: %w", err)
			}
		}

		frames = append(frames, processProtobufMessage(message, msgDesc)...)
	}

	if statusFrame := parseErrorDetails(trailers["grpc-status-details-bin"]); statusFrame != nil {
		frames = append(frames, *statusFrame)
	}

	return frames, nil
}

// parseGrpcWebFrames parses gRPC-Web frames from the content, utilizing headers and trailers for status details.
func parseGrpcWebFrames(content []byte, headers map[string]string, trailers map[string]string, msgDesc protoreflect.MessageDescriptor) ([]string, error) {
	if len(content) < 5 {
		return []string{""}, nil
	}
	var frames []string
	buf := bytes.NewBuffer(content)
	for buf.Len() >= 5 {
		prefix := make([]byte, 1)
		if _, err := io.ReadFull(buf, prefix); err != nil {
			return nil, err
		}

		// Check if it's a data frame (MSB is 0)
		if (prefix[0] & 0x80) == 0 {
			lengthPrefix := make([]byte, 4)
			if _, err := io.ReadFull(buf, lengthPrefix); err != nil {
				return nil, err
			}
			length := binary.BigEndian.Uint32(lengthPrefix)

			if buf.Len() < int(length) {
				return nil, fmt.Errorf("incomplete grpc-web frame")
			}

			message := make([]byte, length)
			if _, err := io.ReadFull(buf, message); err != nil {
				return nil, err
			}

			frames = append(frames, processProtobufMessage(message, msgDesc)...)
		} else if prefix[0] == 0x80 { // Trailer frame
			// We just need to read the length and the content to advance the buffer.
			lengthPrefix := make([]byte, 4)
			if _, err := io.ReadFull(buf, lengthPrefix); err != nil {
				return nil, err
			}
			length := binary.BigEndian.Uint32(lengthPrefix)

			if buf.Len() < int(length) {
				return nil, fmt.Errorf("incomplete grpc-web trailer frame")
			}

			trailer := make([]byte, length)
			if _, err := io.ReadFull(buf, trailer); err != nil {
				return nil, fmt.Errorf("failed to read grpc-web trailer: %w", err)
			}
			frames = append(frames, string(trailer))
		} else {
			return nil, fmt.Errorf("invalid grpc-web frame type: %x", prefix[0])
		}
	}

	if statusFrame := parseErrorDetails(trailers["grpc-status-details-bin"]); statusFrame != nil {
		frames = append(frames, *statusFrame)
	}
	if statusFrame := parseErrorDetails(headers["grpc-status-details-bin"]); statusFrame != nil {
		frames = append(frames, *statusFrame)
	}

	return frames, nil
}

func parseConnectStreamingFrames(content []byte, msgDesc protoreflect.MessageDescriptor) ([]string, error) {
	if len(content) < 5 {
		return []string{""}, nil
	}
	var frames []string
	buf := bytes.NewBuffer(content)
	for buf.Len() >= 5 {
		prefix := make([]byte, 5)
		if _, err := io.ReadFull(buf, prefix); err != nil {
			return nil, err
		}

		flags := prefix[0]
		compressed := (flags & 0x01) == 0x01
		isTrailer := (flags & 0x02) == 0x02

		length := binary.BigEndian.Uint32(prefix[1:])

		if buf.Len() < int(length) {
			return nil, fmt.Errorf("incomplete connect stream frame")
		}

		message := make([]byte, length)
		if _, err := io.ReadFull(buf, message); err != nil {
			return nil, err
		}

		if isTrailer {
			// Trailer is a JSON object in Connect.
			// We try to parse and re-marshal it with indentation.
			var trailer map[string]interface{}
			if err := json.Unmarshal(message, &trailer); err == nil {
				if indented, err := json.MarshalIndent(trailer, "", "  "); err == nil {
					frames = append(frames, string(indented))
					continue
				}
			}
			frames = append(frames, string(message))
			continue
		}

		if compressed {
			gr, err := gzip.NewReader(bytes.NewBuffer(message))
			if err != nil {
				return nil, fmt.Errorf("failed to create gzip reader: %w", err)
			}
			defer gr.Close() //nolint:errcheck
			message, err = io.ReadAll(gr)
			if err != nil {
				return nil, fmt.Errorf("failed to decompress message: %w", err)
			}
		}

		frames = append(frames, processProtobufMessage(message, msgDesc)...)
	}

	return frames, nil
}

func parseErrorDetails(errorDetailsBin string) *string {
	if errorDetailsBin == "" {
		return nil
	}

	decoded, err := base64.StdEncoding.DecodeString(errorDetailsBin)
	if err != nil {
		return nil
	}

	if statusJSON := parseErrorStatusAsJSON(decoded); statusJSON != nil {
		return statusJSON
	}

	opts := protoscope.WriterOptions{
		Schema:          statuspb.File_google_rpc_status_proto.Messages().ByName("Status"),
		PrintFieldNames: true,
		PrintEnumNames:  true,
	}
	frame := protoscope.Write(decoded, opts)
	return &frame
}

func parseErrorStatusAsJSON(statusBytes []byte) *string {
	status := &statuspb.Status{}
	if err := proto.Unmarshal(statusBytes, status); err != nil {
		return nil
	}

	// Attempt to encode it in JSON
	jsonBytes, err := protojson.MarshalOptions{Indent: "  "}.Marshal(status)
	if err != nil {
		return nil
	}

	jsonStr := string(jsonBytes)
	return &jsonStr
}
