package main

import (
	"fmt"
	"log"
	"os"
	"path/filepath"
	"sort"
	"sync"

	mitmflowv1 "github.com/sudorandom/mitmflow/gen/go/mitmflow/v1"
	"google.golang.org/protobuf/proto"
)

type FlowStorage struct {
	mu       sync.RWMutex
	dir      string
	maxFlows int
	flows    map[string]*mitmflowv1.Flow
}

func NewFlowStorage(dir string, maxFlows int) (*FlowStorage, error) {
	if err := os.MkdirAll(dir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create data directory: %w", err)
	}

	s := &FlowStorage{
		dir:      dir,
		maxFlows: maxFlows,
		flows:    make(map[string]*mitmflowv1.Flow),
	}

	if err := s.loadFlows(); err != nil {
		return nil, err
	}

	return s, nil
}

func (s *FlowStorage) loadFlows() error {
	entries, err := os.ReadDir(s.dir)
	if err != nil {
		return fmt.Errorf("failed to read data directory: %w", err)
	}

	for _, entry := range entries {
		if entry.IsDir() || filepath.Ext(entry.Name()) != ".bin" {
			continue
		}

		data, err := os.ReadFile(filepath.Join(s.dir, entry.Name()))
		if err != nil {
			log.Printf("failed to read flow file %s: %v", entry.Name(), err)
			continue
		}

		flow := &mitmflowv1.Flow{}
		if err := proto.Unmarshal(data, flow); err != nil {
			log.Printf("failed to unmarshal flow file %s: %v", entry.Name(), err)
			continue
		}

		id := getFlowID(flow)
		if id == "" {
			continue
		}
		s.flows[id] = flow
	}

	s.prune()

	return nil
}

func (s *FlowStorage) SaveFlow(flow *mitmflowv1.Flow) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	id := getFlowID(flow)
	if id == "" {
		return fmt.Errorf("flow has no ID")
	}

	// Preserve pinned status and note if updating existing flow
	if existing, ok := s.flows[id]; ok {
		if !flow.GetPinned() && existing.GetPinned() {
			flow.SetPinned(true)
		}
		if flow.GetNote() == "" && existing.GetNote() != "" {
			flow.SetNote(existing.GetNote())
		}
	}

	s.flows[id] = flow

	if err := s.saveToDisk(flow); err != nil {
		return err
	}

	s.prune()
	return nil
}

func (s *FlowStorage) UpdateFlow(id string, pinned *bool, note *string) (*mitmflowv1.Flow, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	flow, ok := s.flows[id]
	if !ok {
		return nil, fmt.Errorf("flow not found: %s", id)
	}

	if pinned != nil {
		flow.SetPinned(*pinned)
	}
	if note != nil {
		flow.SetNote(*note)
	}

	if err := s.saveToDisk(flow); err != nil {
		return nil, err
	}

	s.prune()

	return flow, nil
}

func (s *FlowStorage) DeleteFlows(ids []string) (int64, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	var count int64
	for _, id := range ids {
		if _, ok := s.flows[id]; ok {
			delete(s.flows, id)
			if err := os.Remove(filepath.Join(s.dir, id+".bin")); err != nil && !os.IsNotExist(err) {
				log.Printf("failed to remove flow file %s: %v", id, err)
			}
			count++
		}
	}
	return count, nil
}

func (s *FlowStorage) DeleteAllFlows() (int64, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	var deletedCount int64
	// Collect IDs to delete
	var idsToDelete []string
	for id, flow := range s.flows {
		if !flow.GetPinned() {
			idsToDelete = append(idsToDelete, id)
		}
	}

	for _, id := range idsToDelete {
		delete(s.flows, id)
		if err := os.Remove(filepath.Join(s.dir, id+".bin")); err != nil && !os.IsNotExist(err) {
			log.Printf("failed to remove flow file %s: %v", id, err)
		}
		deletedCount++
	}

	return deletedCount, nil
}

func (s *FlowStorage) GetFlows() []*mitmflowv1.Flow {
	s.mu.RLock()
	defer s.mu.RUnlock()

	flows := make([]*mitmflowv1.Flow, 0, len(s.flows))
	for _, f := range s.flows {
		flows = append(flows, f)
	}
	sort.Slice(flows, func(i, j int) bool {
		return getFlowStartTime(flows[i]) < getFlowStartTime(flows[j])
	})

	return flows
}

func (s *FlowStorage) saveToDisk(flow *mitmflowv1.Flow) error {
	data, err := proto.Marshal(flow)
	if err != nil {
		return fmt.Errorf("failed to marshal flow: %w", err)
	}

	id := getFlowID(flow)
	filename := filepath.Join(s.dir, id+".bin")
	return os.WriteFile(filename, data, 0644)
}

func (s *FlowStorage) prune() {
	// Collect unpinned flows
	var unpinned []*mitmflowv1.Flow
	for _, f := range s.flows {
		if !f.GetPinned() {
			unpinned = append(unpinned, f)
		}
	}

	if len(unpinned) <= s.maxFlows {
		return
	}

	// Sort unpinned by timestamp (oldest first)
	sort.Slice(unpinned, func(i, j int) bool {
		return getFlowStartTime(unpinned[i]) < getFlowStartTime(unpinned[j])
	})

	// Remove oldest
	toRemoveCount := len(unpinned) - s.maxFlows
	for i := 0; i < toRemoveCount; i++ {
		f := unpinned[i]
		id := getFlowID(f)
		delete(s.flows, id)
		os.Remove(filepath.Join(s.dir, id+".bin"))
	}
}

func getFlowID(flow *mitmflowv1.Flow) string {
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

func getFlowStartTime(flow *mitmflowv1.Flow) int64 {
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
