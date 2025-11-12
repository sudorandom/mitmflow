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

  // Advanced Filters
  flowTypes: FlowType[];
  setFlowTypes: (flowTypes: FlowType[]) => void;

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
      flowTypes: [],
      setFlowTypes: (flowTypes) => set({ flowTypes }),
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
          flowTypes: [],
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
        flowTypes: state.flowTypes,
        http: state.http,
      }),
    }
  )
);

export default useFilterStore;
