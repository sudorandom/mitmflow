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
	mu          sync.RWMutex
	dir         string
	maxFlows    int
	flows       map[string]*mitmflowv1.Flow
	sortedFlows []*mitmflowv1.Flow
}

func NewFlowStorage(dir string, maxFlows int) (*FlowStorage, error) {
	if err := os.MkdirAll(dir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create data directory: %w", err)
	}

	s := &FlowStorage{
		dir:         dir,
		maxFlows:    maxFlows,
		flows:       make(map[string]*mitmflowv1.Flow),
		sortedFlows: make([]*mitmflowv1.Flow, 0),
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

	for _, f := range s.flows {
		s.sortedFlows = append(s.sortedFlows, f)
	}
	sort.Slice(s.sortedFlows, func(i, j int) bool {
		return getFlowStartTime(s.sortedFlows[i]) < getFlowStartTime(s.sortedFlows[j])
	})

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
	isUpdate := false
	if existing, ok := s.flows[id]; ok {
		isUpdate = true
		if !flow.GetPinned() && existing.GetPinned() {
			flow.SetPinned(true)
		}
		if flow.GetNote() == "" && existing.GetNote() != "" {
			flow.SetNote(existing.GetNote())
		}
	}

	s.flows[id] = flow
	s.updateSortedFlows(flow, isUpdate)

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
	toDelete := make(map[string]bool)
	for _, id := range ids {
		if _, ok := s.flows[id]; ok {
			delete(s.flows, id)
			toDelete[id] = true
			if err := os.Remove(filepath.Join(s.dir, id+".bin")); err != nil && !os.IsNotExist(err) {
				log.Printf("failed to remove flow file %s: %v", id, err)
			}
			count++
		}
	}

	if count > 0 {
		newSortedFlows := make([]*mitmflowv1.Flow, 0, len(s.sortedFlows)-int(count))
		for _, f := range s.sortedFlows {
			id := getFlowID(f)
			if !toDelete[id] {
				newSortedFlows = append(newSortedFlows, f)
			}
		}
		s.sortedFlows = newSortedFlows
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

	toDelete := make(map[string]bool)
	for _, id := range idsToDelete {
		delete(s.flows, id)
		toDelete[id] = true
		if err := os.Remove(filepath.Join(s.dir, id+".bin")); err != nil && !os.IsNotExist(err) {
			log.Printf("failed to remove flow file %s: %v", id, err)
		}
		deletedCount++
	}

	if deletedCount > 0 {
		newSortedFlows := make([]*mitmflowv1.Flow, 0, len(s.sortedFlows)-int(deletedCount))
		for _, f := range s.sortedFlows {
			id := getFlowID(f)
			if !toDelete[id] {
				newSortedFlows = append(newSortedFlows, f)
			}
		}
		s.sortedFlows = newSortedFlows
	}

	return deletedCount, nil
}

func (s *FlowStorage) GetFlows() []*mitmflowv1.Flow {
	s.mu.RLock()
	defer s.mu.RUnlock()

	flows := make([]*mitmflowv1.Flow, len(s.sortedFlows))
	copy(flows, s.sortedFlows)

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
	if len(s.flows) <= s.maxFlows {
		return
	}

	toRemove := len(s.flows) - s.maxFlows
	removedCount := 0

	// s.sortedFlows is sorted by timestamp (oldest first)
	// We iterate and remove unpinned flows until we satisfy the limit
	newSortedFlows := make([]*mitmflowv1.Flow, 0, len(s.sortedFlows))

	for _, f := range s.sortedFlows {
		if removedCount < toRemove && !f.GetPinned() {
			id := getFlowID(f)
			delete(s.flows, id)
			os.Remove(filepath.Join(s.dir, id+".bin"))
			removedCount++
			continue
		}
		newSortedFlows = append(newSortedFlows, f)
	}
	s.sortedFlows = newSortedFlows
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

func (s *FlowStorage) updateSortedFlows(flow *mitmflowv1.Flow, isUpdate bool) {
	if isUpdate {
		id := getFlowID(flow)
		s.removeFromSortedFlows(id)
	}
	s.insertIntoSortedFlows(flow)
}

func (s *FlowStorage) removeFromSortedFlows(id string) {
	for i, f := range s.sortedFlows {
		if getFlowID(f) == id {
			// Remove
			s.sortedFlows = append(s.sortedFlows[:i], s.sortedFlows[i+1:]...)
			return
		}
	}
}

func (s *FlowStorage) insertIntoSortedFlows(flow *mitmflowv1.Flow) {
	newTime := getFlowStartTime(flow)
	// Optimization: check last
	if len(s.sortedFlows) == 0 || newTime >= getFlowStartTime(s.sortedFlows[len(s.sortedFlows)-1]) {
		s.sortedFlows = append(s.sortedFlows, flow)
		return
	}

	// Binary search
	index := sort.Search(len(s.sortedFlows), func(i int) bool {
		return getFlowStartTime(s.sortedFlows[i]) >= newTime
	})

	s.sortedFlows = append(s.sortedFlows, nil)           // Extend capacity
	copy(s.sortedFlows[index+1:], s.sortedFlows[index:]) // Shift
	s.sortedFlows[index] = flow
}
