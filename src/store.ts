import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type FlowType = 'http' | 'dns' | 'tcp' | 'udp';

export const FLOW_TYPES: { value: FlowType; label: string }[] = [
  { value: 'http', label: 'HTTP' },
  { value: 'dns', label: 'DNS' },
  { value: 'tcp', label: 'TCP' },
  { value: 'udp', label: 'UDP' },
];

interface HttpFilterState {
  methods: string[];
  contentTypes: string[];
  statusCodes: string[];
}

interface FilterState {
  // General Filters
  text: string;
  setText: (text: string) => void;

  pinned: boolean | undefined;
  setPinned: (pinned: boolean | undefined) => void;

  hasNote: boolean | undefined;
  setHasNote: (hasNote: boolean | undefined) => void;

  // Advanced Filters
  flowTypes: FlowType[];
  setFlowTypes: (flowTypes: FlowType[]) => void;

  clientIps: string[];
  setClientIps: (ips: string[]) => void;

  // HTTP Specific Filters
  http: HttpFilterState;
  setHttpMethods: (methods: string[]) => void;
  setHttpContentTypes: (contentTypes: string[]) => void;
  setHttpStatusCodes: (statusCodes: string[]) => void;


  // Actions
  clearFilters: () => void;
}

const useFilterStore = create<FilterState>()(
  persist(
    (set) => ({
      text: '',
      setText: (text) => set({ text }),
      pinned: undefined,
      setPinned: (pinned) => set({ pinned }),
      hasNote: undefined,
      setHasNote: (hasNote) => set({ hasNote }),
      flowTypes: [],
      setFlowTypes: (flowTypes) => set({ flowTypes }),
      clientIps: [],
      setClientIps: (clientIps) => set({ clientIps }),
      http: {
        methods: [],
        contentTypes: [],
        statusCodes: [],
      },
      setHttpMethods: (methods) =>
        set((state) => ({ http: { ...state.http, methods } })),
      setHttpContentTypes: (contentTypes) =>
        set((state) => ({ http: { ...state.http, contentTypes } })),
      setHttpStatusCodes: (statusCodes) =>
        set((state) => ({ http: { ...state.http, statusCodes } })),
      clearFilters: () =>
        set((state) => ({
          text: '',
          pinned: undefined,
          hasNote: undefined,
          flowTypes: [],
          clientIps: [],
          http: {
            ...state.http,
            methods: [],
            contentTypes: [],
            statusCodes: [],
          },
        })),
    }),
    {
      name: 'filter-storage', // name of the item in the storage (must be unique)
      version: 1, // bump version to migrate old state
      migrate: (persistedState: unknown, version: number) => {
        if (version < 1 && persistedState && typeof persistedState === 'object') {
          // If old version, clear flowTypes to default to none selected
          (persistedState as FilterState).flowTypes = [];
        }
        return persistedState as FilterState;
      },
      partialize: (state) => ({
        text: state.text,
        pinned: state.pinned,
        hasNote: state.hasNote,
        flowTypes: state.flowTypes,
        clientIps: state.clientIps,
        http: state.http,
      }),
    }
  )
);

export default useFilterStore;
