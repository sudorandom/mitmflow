package main

import (
	"fmt"
	"log"
	"os"
	"path/filepath"
	"runtime"
	"sync"

	mitmflowv1 "github.com/sudorandom/mitmflow/gen/go/mitmflow/v1"
	"golang.org/x/sync/errgroup"
	"google.golang.org/protobuf/proto"
)

type FlowStorage struct {
	mu       sync.RWMutex
	dir      string
	maxFlows int
	store    Store
}

func NewFlowStorage(dir string, maxFlows int) (*FlowStorage, error) {
	if err := os.MkdirAll(dir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create data directory: %w", err)
	}

	s := &FlowStorage{
		dir:      dir,
		maxFlows: maxFlows,
		store:    NewMemoryStore(),
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

	g := new(errgroup.Group)
	g.SetLimit(runtime.GOMAXPROCS(0) * 4)

	for _, entry := range entries {
		entry := entry
		if entry.IsDir() || filepath.Ext(entry.Name()) != ".bin" {
			continue
		}

		g.Go(func() error {
			data, err := os.ReadFile(filepath.Join(s.dir, entry.Name()))
			if err != nil {
				log.Printf("failed to read flow file %s: %v", entry.Name(), err)
				return nil
			}

			flow := &mitmflowv1.Flow{}
			if err := proto.Unmarshal(data, flow); err != nil {
				log.Printf("failed to unmarshal flow file %s: %v", entry.Name(), err)
				return nil
			}

			if GetFlowID(flow) == "" {
				return nil
			}

			s.store.Upsert(flow)
			return nil
		})
	}

	if err := g.Wait(); err != nil {
		return err
	}

	s.prune()

	return nil
}

func (s *FlowStorage) SaveFlow(flow *mitmflowv1.Flow) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	id := GetFlowID(flow)
	if id == "" {
		return fmt.Errorf("flow has no ID")
	}

	// Preserve pinned status and note if updating existing flow
	if existing, ok := s.store.Get(id); ok {
		if !flow.GetPinned() && existing.GetPinned() {
			flow.SetPinned(true)
		}
		if flow.GetNote() == "" && existing.GetNote() != "" {
			flow.SetNote(existing.GetNote())
		}
	}

	s.store.Upsert(flow)

	if err := s.saveToDisk(flow); err != nil {
		return err
	}

	s.prune()
	return nil
}

func (s *FlowStorage) UpdateFlow(id string, pinned *bool, note *string) (*mitmflowv1.Flow, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	flow, ok := s.store.Get(id)
	if !ok {
		return nil, fmt.Errorf("flow not found: %s", id)
	}

	if pinned != nil {
		flow.SetPinned(*pinned)
	}
	if note != nil {
		flow.SetNote(*note)
	}

	// Upsert to ensure store state is consistent
	s.store.Upsert(flow)

	if err := s.saveToDisk(flow); err != nil {
		return nil, err
	}

	s.prune()

	return flow, nil
}

func (s *FlowStorage) DeleteFlows(ids []string) (int64, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	deletedIDs := s.store.Delete(ids...)
	for _, id := range deletedIDs {
		if err := os.Remove(filepath.Join(s.dir, id+".bin")); err != nil && !os.IsNotExist(err) {
			log.Printf("failed to remove flow file %s: %v", id, err)
		}
	}

	return int64(len(deletedIDs)), nil
}

func (s *FlowStorage) DeleteAllFlows() (int64, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	deletedIDs := s.store.DeleteAllUnpinned()
	for _, id := range deletedIDs {
		if err := os.Remove(filepath.Join(s.dir, id+".bin")); err != nil && !os.IsNotExist(err) {
			log.Printf("failed to remove flow file %s: %v", id, err)
		}
	}

	return int64(len(deletedIDs)), nil
}

func (s *FlowStorage) GetFlows() []*mitmflowv1.Flow {
	return s.store.List()
}

func (s *FlowStorage) GetFlow(id string) (*mitmflowv1.Flow, bool) {
	return s.store.Get(id)
}

func (s *FlowStorage) saveToDisk(flow *mitmflowv1.Flow) error {
	data, err := proto.Marshal(flow)
	if err != nil {
		return fmt.Errorf("failed to marshal flow: %w", err)
	}

	id := GetFlowID(flow)
	filename := filepath.Join(s.dir, id+".bin")
	return os.WriteFile(filename, data, 0644)
}

func (s *FlowStorage) prune() {
	deletedIDs := s.store.Prune(s.maxFlows)
	for _, id := range deletedIDs {
		os.Remove(filepath.Join(s.dir, id+".bin"))
	}
}
