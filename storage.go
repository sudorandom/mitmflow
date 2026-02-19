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
	mu        sync.RWMutex
	dir       string
	maxFlows  int
	store     Store
	persistCh chan func()
	wg        sync.WaitGroup
}

func NewFlowStorage(dir string, maxFlows int) (*FlowStorage, error) {
	if err := os.MkdirAll(dir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create data directory: %w", err)
	}

	s := &FlowStorage{
		dir:       dir,
		maxFlows:  maxFlows,
		store:     NewMemoryStore(),
		persistCh: make(chan func(), 1000), // Buffer to avoid blocking main path
	}

	s.wg.Add(1)
	go s.persistWorker(s.persistCh)

	if err := s.loadFlows(); err != nil {
		return nil, err
	}

	return s, nil
}

func (s *FlowStorage) persistWorker(ch chan func()) {
	defer s.wg.Done()
	for task := range ch {
		task()
	}
}

func (s *FlowStorage) Close() {
	s.mu.Lock()
	if s.persistCh != nil {
		close(s.persistCh)
		s.persistCh = nil
	}
	s.mu.Unlock()
	s.wg.Wait()
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

	if s.persistCh == nil {
		return fmt.Errorf("storage closed")
	}

	// Clone flow for async persistence to avoid data races
	flowClone := proto.Clone(flow).(*mitmflowv1.Flow)
	s.persistCh <- func() {
		if err := s.saveToDisk(flowClone); err != nil {
			log.Printf("failed to save flow %s: %v", GetFlowID(flowClone), err)
		}
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

	if s.persistCh == nil {
		return nil, fmt.Errorf("storage closed")
	}

	flowClone := proto.Clone(flow).(*mitmflowv1.Flow)
	s.persistCh <- func() {
		if err := s.saveToDisk(flowClone); err != nil {
			log.Printf("failed to save flow %s: %v", id, err)
		}
	}

	s.prune()

	return flow, nil
}

func (s *FlowStorage) DeleteFlows(ids []string) (int64, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	deletedIDs := s.store.Delete(ids...)
	if len(deletedIDs) > 0 {
		if s.persistCh == nil {
			return int64(len(deletedIDs)), nil
		}
		// Copy IDs for the closure
		idsToDelete := make([]string, len(deletedIDs))
		copy(idsToDelete, deletedIDs)

		s.persistCh <- func() {
			for _, id := range idsToDelete {
				if err := os.Remove(filepath.Join(s.dir, id+".bin")); err != nil && !os.IsNotExist(err) {
					log.Printf("failed to remove flow file %s: %v", id, err)
				}
			}
		}
	}

	return int64(len(deletedIDs)), nil
}

func (s *FlowStorage) DeleteAllFlows() (int64, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	deletedIDs := s.store.DeleteAllUnpinned()
	if len(deletedIDs) > 0 {
		if s.persistCh == nil {
			return int64(len(deletedIDs)), nil
		}
		idsToDelete := make([]string, len(deletedIDs))
		copy(idsToDelete, deletedIDs)

		s.persistCh <- func() {
			for _, id := range idsToDelete {
				if err := os.Remove(filepath.Join(s.dir, id+".bin")); err != nil && !os.IsNotExist(err) {
					log.Printf("failed to remove flow file %s: %v", id, err)
				}
			}
		}
	}

	return int64(len(deletedIDs)), nil
}

func (s *FlowStorage) GetFlows() []*mitmflowv1.Flow {
	return s.store.List()
}

func (s *FlowStorage) Walk(fn func(*mitmflowv1.Flow) bool) {
	s.store.Walk(fn)
}

func (s *FlowStorage) ReverseWalk(fn func(*mitmflowv1.Flow) bool) {
	s.store.ReverseWalk(fn)
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
	if len(deletedIDs) > 0 {
		if s.persistCh == nil {
			return
		}
		// Copy IDs for closure
		idsToDelete := make([]string, len(deletedIDs))
		copy(idsToDelete, deletedIDs)

		s.persistCh <- func() {
			for _, id := range idsToDelete {
				os.Remove(filepath.Join(s.dir, id+".bin")) //nolint:errcheck
			}
		}
	}
}
