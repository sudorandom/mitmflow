import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface FilterState {
  // General Filters
  text: string;
  setText: (text: string) => void;

  // Actions
  clearFilters: () => void;
}

const useFilterStore = create<FilterState>()(
  persist(
    (set) => ({
      text: '',
      setText: (text) => set({ text }),
      clearFilters: () =>
        set({
          text: '',
        }),
    }),
    {
      name: 'filter-storage', // name of the item in the storage (must be unique)
    }
  )
);

export default useFilterStore;
