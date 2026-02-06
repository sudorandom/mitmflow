package main

import (
	"sort"
	"sync"

	mitmflowv1 "github.com/sudorandom/mitmflow/gen/go/mitmflow/v1"
)

// Store defines the interface for flow storage operations.
type Store interface {
	// Upsert adds or updates a flow in the store.
	Upsert(flow *mitmflowv1.Flow)
	// Get retrieves a flow by its ID.
	Get(id string) (*mitmflowv1.Flow, bool)
	// List returns all flows in the store, sorted by start time.
	List() []*mitmflowv1.Flow
	// Delete removes flows with the given IDs and returns the IDs of the flows that were actually removed.
	Delete(ids ...string) []string
	// DeleteAllUnpinned removes all unpinned flows and returns their IDs.
	DeleteAllUnpinned() []string
	// Prune removes the oldest unpinned flows if the store size exceeds maxSize.
	// It returns the IDs of the removed flows.
	Prune(maxSize int) []string
	// Len returns the number of flows in the store.
	Len() int
}

type memoryStore struct {
	mu          sync.RWMutex
	flows       map[string]*mitmflowv1.Flow
	sortedFlows []*mitmflowv1.Flow
}

// NewMemoryStore creates a new in-memory flow store.
func NewMemoryStore() Store {
	return &memoryStore{
		flows:       make(map[string]*mitmflowv1.Flow),
		sortedFlows: make([]*mitmflowv1.Flow, 0),
	}
}

func (s *memoryStore) Upsert(flow *mitmflowv1.Flow) {
	s.mu.Lock()
	defer s.mu.Unlock()

	id := GetFlowID(flow)
	if id == "" {
		return
	}

	isUpdate := false
	if _, ok := s.flows[id]; ok {
		isUpdate = true
	}

	s.flows[id] = flow
	s.updateSortedFlows(flow, isUpdate)
}

func (s *memoryStore) Get(id string) (*mitmflowv1.Flow, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	flow, ok := s.flows[id]
	return flow, ok
}

func (s *memoryStore) List() []*mitmflowv1.Flow {
	s.mu.RLock()
	defer s.mu.RUnlock()

	flows := make([]*mitmflowv1.Flow, len(s.sortedFlows))
	copy(flows, s.sortedFlows)
	return flows
}

func (s *memoryStore) Delete(ids ...string) []string {
	s.mu.Lock()
	defer s.mu.Unlock()

	var deleted []string
	toDelete := make(map[string]bool)

	for _, id := range ids {
		if _, ok := s.flows[id]; ok {
			delete(s.flows, id)
			toDelete[id] = true
			deleted = append(deleted, id)
		}
	}

	if len(deleted) > 0 {
		s.rebuildSortedFlows(toDelete)
	}

	return deleted
}

func (s *memoryStore) DeleteAllUnpinned() []string {
	s.mu.Lock()
	defer s.mu.Unlock()

	var deleted []string
	toDelete := make(map[string]bool)

	for id, flow := range s.flows {
		if !flow.GetPinned() {
			delete(s.flows, id)
			toDelete[id] = true
			deleted = append(deleted, id)
		}
	}

	if len(deleted) > 0 {
		s.rebuildSortedFlows(toDelete)
	}

	return deleted
}

func (s *memoryStore) Prune(maxSize int) []string {
	s.mu.Lock()
	defer s.mu.Unlock()

	if len(s.flows) <= maxSize {
		return nil
	}

	toRemove := len(s.flows) - maxSize
	removedCount := 0
	var deleted []string

	// Filter in-place to avoid allocating a new slice
	newLen := 0
	for i, f := range s.sortedFlows {
		if removedCount < toRemove && !f.GetPinned() {
			id := GetFlowID(f)
			delete(s.flows, id)
			deleted = append(deleted, id)
			removedCount++
			continue
		}

		if newLen != i {
			s.sortedFlows[newLen] = f
		}
		newLen++
	}

	// Nil out the remaining elements to avoid memory leaks
	for i := newLen; i < len(s.sortedFlows); i++ {
		s.sortedFlows[i] = nil
	}

	s.sortedFlows = s.sortedFlows[:newLen]
	return deleted
}

func (s *memoryStore) Len() int {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return len(s.flows)
}

func (s *memoryStore) updateSortedFlows(flow *mitmflowv1.Flow, isUpdate bool) {
	if isUpdate {
		id := GetFlowID(flow)
		s.removeFromSortedFlows(id)
	}
	s.insertIntoSortedFlows(flow)
}

func (s *memoryStore) removeFromSortedFlows(id string) {
	for i, f := range s.sortedFlows {
		if GetFlowID(f) == id {
			s.sortedFlows = append(s.sortedFlows[:i], s.sortedFlows[i+1:]...)
			return
		}
	}
}

func (s *memoryStore) insertIntoSortedFlows(flow *mitmflowv1.Flow) {
	newTime := GetFlowStartTime(flow)
	// Optimization: check last
	if len(s.sortedFlows) == 0 || newTime >= GetFlowStartTime(s.sortedFlows[len(s.sortedFlows)-1]) {
		s.sortedFlows = append(s.sortedFlows, flow)
		return
	}

	// Binary search
	index := sort.Search(len(s.sortedFlows), func(i int) bool {
		return GetFlowStartTime(s.sortedFlows[i]) >= newTime
	})

	s.sortedFlows = append(s.sortedFlows, nil)           // Extend capacity
	copy(s.sortedFlows[index+1:], s.sortedFlows[index:]) // Shift
	s.sortedFlows[index] = flow
}

func (s *memoryStore) rebuildSortedFlows(toDelete map[string]bool) {
	newSortedFlows := make([]*mitmflowv1.Flow, 0, len(s.sortedFlows)-len(toDelete))
	for _, f := range s.sortedFlows {
		id := GetFlowID(f)
		if !toDelete[id] {
			newSortedFlows = append(newSortedFlows, f)
		}
	}
	s.sortedFlows = newSortedFlows
}

// GetFlowID returns the ID of the flow.
func GetFlowID(flow *mitmflowv1.Flow) string {
	if flow == nil {
		return ""
	}
	if f := flow.GetHttpFlow(); f != nil {
		return f.GetId()
	}
	if f := flow.GetTcpFlow(); f != nil {
		return f.GetId()
	}
	if f := flow.GetUdpFlow(); f != nil {
		return f.GetId()
	}
	if f := flow.GetDnsFlow(); f != nil {
		return f.GetId()
	}
	return ""
}

// GetFlowStartTime returns the start timestamp of the flow in nanoseconds.
func GetFlowStartTime(flow *mitmflowv1.Flow) int64 {
	if f := flow.GetHttpFlow(); f != nil {
		if t := f.GetTimestampStart(); t != nil {
			return t.GetSeconds()*1e9 + int64(t.GetNanos())
		}
	}
	if f := flow.GetTcpFlow(); f != nil {
		if t := f.GetTimestampStart(); t != nil {
			return t.GetSeconds()*1e9 + int64(t.GetNanos())
		}
	}
	if f := flow.GetUdpFlow(); f != nil {
		if t := f.GetTimestampStart(); t != nil {
			return t.GetSeconds()*1e9 + int64(t.GetNanos())
		}
	}
	if f := flow.GetDnsFlow(); f != nil {
		if t := f.GetTimestampStart(); t != nil {
			return t.GetSeconds()*1e9 + int64(t.GetNanos())
		}
	}
	return 0
}
