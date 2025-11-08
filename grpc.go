package main

import (
	"bytes"
	"compress/gzip"
	"encoding/binary"
	"fmt"
	"io"

	"github.com/protocolbuffers/protoscope"
)

func parseGrpcFrames(content []byte) ([]string, error) {
	var frames []string
	buf := bytes.NewBuffer(content)
	for buf.Len() > 5 {
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
			defer gr.Close()
			message, err = io.ReadAll(gr)
			if err != nil {
				return nil, fmt.Errorf("failed to decompress message: %w", err)
			}
		}

		opts := protoscope.WriterOptions{}
		protoscopeOutput := protoscope.Write(message, opts)
		frames = append(frames, protoscopeOutput)
	}
	return frames, nil
}

func parseGrpcWebFrames(content []byte) ([]string, error) {
	var frames []string
	buf := bytes.NewBuffer(content)
	for buf.Len() > 5 {
		prefix := make([]byte, 1)
		if _, err := io.ReadFull(buf, prefix); err != nil {
			return nil, err
		}

		// Check if it's a data frame (MSB is 0)
		if prefix[0]>>7 == 0 {
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

			opts := protoscope.WriterOptions{}
			protoscopeOutput := protoscope.Write(message, opts)
			frames = append(frames, protoscopeOutput)
		} else {
			// Trailer frame, we can ignore it for now.
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
				return nil, err
			}
		}
	}
	return frames, nil
}
