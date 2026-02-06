package main

import (
	"os"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	mitmflowv1 "github.com/sudorandom/mitmflow/gen/go/mitmflow/v1"
	mitmproxyv1 "github.com/sudorandom/mitmflow/gen/go/mitmproxygrpc/v1"
	"google.golang.org/protobuf/types/known/timestamppb"
)

func createFlow(id string, ts time.Time) *mitmflowv1.Flow {
	httpFlow := &mitmproxyv1.HTTPFlow{}
	httpFlow.SetId(id)
	httpFlow.SetTimestampStart(timestamppb.New(ts))

	flow := &mitmflowv1.Flow{}
	flow.SetHttpFlow(httpFlow)
	return flow
}

func TestFlowStorage_SortOrder(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "mitmflow_test_sort")
	assert.NoError(t, err)
	defer os.RemoveAll(tmpDir)

	s, err := NewFlowStorage(tmpDir, 100)
	assert.NoError(t, err)

	t1 := time.Now()
	t2 := t1.Add(1 * time.Second)
	t3 := t1.Add(2 * time.Second)

	f1 := createFlow("1", t1)
	f3 := createFlow("3", t3)
	f2 := createFlow("2", t2)

	// Save out of order
	s.SaveFlow(f3)
	s.SaveFlow(f1)
	s.SaveFlow(f2)

	flows := s.GetFlows()
	assert.Equal(t, 3, len(flows))
	assert.Equal(t, "1", GetFlowID(flows[0]))
	assert.Equal(t, "2", GetFlowID(flows[1]))
	assert.Equal(t, "3", GetFlowID(flows[2]))
}

func TestFlowStorage_Prune(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "mitmflow_test_prune")
	assert.NoError(t, err)
	defer os.RemoveAll(tmpDir)

	maxFlows := 3
	s, err := NewFlowStorage(tmpDir, maxFlows)
	assert.NoError(t, err)

	// Add 3 flows
	baseTime := time.Now()
	for i := 0; i < 3; i++ {
		s.SaveFlow(createFlow(uuid.New().String(), baseTime.Add(time.Duration(i)*time.Second)))
	}
	assert.Equal(t, 3, len(s.GetFlows()))

	// Add 4th flow, should prune oldest (first one)
	s.SaveFlow(createFlow("new", baseTime.Add(10*time.Second)))

	flows := s.GetFlows()
	assert.Equal(t, 3, len(flows))
	// Oldest was at 0s. Next oldest at 1s.
	// So we expect 1s, 2s, 10s.
	// We check timestamp, but simpler is to check IDs.
	// First 3 IDs were random. Last is "new".
	// The 0th ID should be gone.
	assert.Equal(t, "new", GetFlowID(flows[2]))
}

func TestFlowStorage_PrunePinned(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "mitmflow_test_prune_pinned")
	assert.NoError(t, err)
	defer os.RemoveAll(tmpDir)

	maxFlows := 3
	s, err := NewFlowStorage(tmpDir, maxFlows)
	assert.NoError(t, err)

	baseTime := time.Now()
	f1 := createFlow("1", baseTime.Add(1*time.Second))
	f1.SetPinned(true)
	s.SaveFlow(f1)

	f2 := createFlow("2", baseTime.Add(2*time.Second))
	s.SaveFlow(f2)

	f3 := createFlow("3", baseTime.Add(3*time.Second))
	s.SaveFlow(f3)

	// Flows: 1(pinned), 2, 3. Count=3. Max=3.

	// Add 4th. Should prune oldest unpinned.
	// Oldest is 1 (pinned). Next is 2 (unpinned).
	// So 2 should be removed.
	f4 := createFlow("4", baseTime.Add(4*time.Second))
	s.SaveFlow(f4)

	flows := s.GetFlows()
	assert.Equal(t, 3, len(flows))

	ids := make([]string, 0)
	for _, f := range flows {
		ids = append(ids, GetFlowID(f))
	}
	// 1 is pinned so kept. 2 is removed. 3 is kept. 4 is added.
	// Expected order: 1, 3, 4
	assert.Equal(t, []string{"1", "3", "4"}, ids)
}

func TestFlowStorage_UpdateFlow(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "mitmflow_test_update")
	assert.NoError(t, err)
	defer os.RemoveAll(tmpDir)

	s, err := NewFlowStorage(tmpDir, 10)
	assert.NoError(t, err)

	f1 := createFlow("1", time.Now())
	s.SaveFlow(f1)

	// Update pinned
	pinned := true
	s.UpdateFlow("1", &pinned, nil)

	flows := s.GetFlows()
	assert.True(t, flows[0].GetPinned())

	// Update note
	note := "my note"
	s.UpdateFlow("1", nil, &note)

	flows = s.GetFlows()
	assert.Equal(t, "my note", flows[0].GetNote())
}

func TestFlowStorage_DeleteFlows(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "mitmflow_test_delete")
	assert.NoError(t, err)
	defer os.RemoveAll(tmpDir)

	s, err := NewFlowStorage(tmpDir, 10)
	assert.NoError(t, err)

	s.SaveFlow(createFlow("1", time.Now()))
	s.SaveFlow(createFlow("2", time.Now().Add(time.Second)))

	count, err := s.DeleteFlows([]string{"1"})
	assert.NoError(t, err)
	assert.Equal(t, int64(1), count)

	flows := s.GetFlows()
	assert.Equal(t, 1, len(flows))
	assert.Equal(t, "2", GetFlowID(flows[0]))
}
