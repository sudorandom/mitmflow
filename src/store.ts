import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type FlowType = 'http' | 'dns' | 'tcp' | 'udp';

interface HttpFilterState {
  methods: string[];
  contentTypes: string[];
  statusCodes: string[];
}

interface FilterState {
  // General Filters
  text: string;
  setText: (text: string) => void;

  pinnedOnly: boolean;
  setPinnedOnly: (pinnedOnly: boolean) => void;

  hasNote: boolean;
  setHasNote: (hasNote: boolean) => void;

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
      pinnedOnly: false,
      setPinnedOnly: (pinnedOnly) => set({ pinnedOnly }),
      hasNote: false,
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
          pinnedOnly: false,
          hasNote: false,
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
      partialize: (state) => ({
        text: state.text,
        pinnedOnly: state.pinnedOnly,
        hasNote: state.hasNote,
        flowTypes: state.flowTypes,
        clientIps: state.clientIps,
        http: state.http,
      }),
    }
  )
);

export default useFilterStore;
