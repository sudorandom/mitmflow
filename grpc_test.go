package main

import (
	"encoding/base64"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestParseGrpcWebFrames(t *testing.T) {
	tests := []struct {
		name    string
		input   string
		want    []string
		wantErr bool
	}{
		{
			name:  "empty response",
			input: "AAAAAAA=",
			want:  []string{""},
		},
		{
			name:  "response with data and trailer",
			input: "AAAAAAYiBAhkKAqAAAAAEGdycGMtc3RhdHVzOiAwDQo=",
			want: []string{
				"4: {\n  1: 100\n  5: 10\n}\n",
				"grpc-status: 0\r\n",
			},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			data, err := base64.StdEncoding.DecodeString(tt.input)
			if err != nil {
				t.Fatalf("failed to decode base64 string: %v", err)
			}
			got, err := parseGrpcWebFrames(data, nil, nil)
			if tt.wantErr {
				require.Error(t, err)
				return
			}
			require.NoError(t, err, tt.wantErr)
			assert.Equal(t, tt.want, got)
		})
	}
}
