import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type FlowType = 'http' | 'dns' | 'tcp' | 'udp';

interface FilterState {
  // General Filters
  text: string;
  setText: (text: string) => void;

  // Advanced Filters
  flowTypes: FlowType[];
  setFlowTypes: (flowTypes: FlowType[]) => void;

  // HTTP Specific Filters
  http: {
    methods: string[];
    setMethods: (methods: string[]) => void;
    contentTypes: string[];
    setContentTypes: (contentTypes: string[]) => void;
    statusCodes: string[];
    setStatusCodes: (statusCodes: string[]) => void;
  };

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
        setMethods: (methods) =>
          set((state) => ({ http: { ...state.http, methods } })),
        contentTypes: [],
        setContentTypes: (contentTypes) =>
          set((state) => ({ http: { ...state.http, contentTypes } })),
        statusCodes: [],
        setStatusCodes: (statusCodes) =>
          set((state) => ({ http: { ...state.http, statusCodes } })),
      },
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
    }
  )
);

export default useFilterStore;
