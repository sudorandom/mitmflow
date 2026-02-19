package main

import (
	"context"
	"fmt"
	"os"
	"testing"
	"time"

	"connectrpc.com/connect"
	"github.com/stretchr/testify/require"
	mitmflowv1 "github.com/sudorandom/mitmflow/gen/go/mitmflow/v1"
)

func BenchmarkExportFlows(b *testing.B) {
	tmpDir, err := os.MkdirTemp("", "mitmflow_bench")
	if err != nil {
		b.Fatal(err)
	}
	b.Cleanup(func() {
		require.NoError(b, os.RemoveAll(tmpDir))
	})

	maxFlows := 10000
	storage, err := NewFlowStorage(tmpDir, maxFlows)
	if err != nil {
		b.Fatal(err)
	}

	registry := NewRegistry()
	server, _ := NewMITMFlowServer(storage, registry)

	flowIDs := make([]string, 5000)
	for i := range flowIDs {
		id := fmt.Sprintf("flow-%d", i)
		flowIDs[i] = id
		require.NoError(b, storage.SaveFlow(createFlow(id, time.Now().Add(time.Duration(i)*time.Second))))
	}

	formatJSON := mitmflowv1.ExportFormat_EXPORT_FORMAT_JSON
	req := &connect.Request[mitmflowv1.ExportFlowsRequest]{
		Msg: mitmflowv1.ExportFlowsRequest_builder{
			// Request 10 flows
			FlowIds: []string{"flow-0", "flow-500", "flow-1000", "flow-1500", "flow-2000", "flow-2500", "flow-3000", "flow-3500", "flow-4000", "flow-4500"},
			Format:  &formatJSON,
		}.Build(),
	}

	for b.Loop() {
		_, err := server.ExportFlows(context.Background(), req)
		if err != nil {
			b.Fatal(err)
		}
	}
}
