import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ThemeMode = 'system' | 'light' | 'dark';

interface SettingsState {
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  maxFlows: number;
  setMaxFlows: (maxFlows: number) => void;
  maxBodySize: number;
  setMaxBodySize: (maxBodySize: number) => void;
}

const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      theme: 'system',
      setTheme: (theme) => set({ theme }),
      maxFlows: 500,
      setMaxFlows: (maxFlows) => set({ maxFlows }),
      maxBodySize: 1024,
      setMaxBodySize: (maxBodySize) => set({ maxBodySize }),
    }),
    {
      name: 'settings-storage',
      version: 1,
      migrate: (persistedState: unknown, version) => {
        if (version === 0) {
          // migration from version 0 to 1
          const state = persistedState as Partial<SettingsState>;
          return {
            ...state,
            // Ensure maxFlows is a valid finite number, otherwise default to 500
            maxFlows: (typeof state.maxFlows === 'number' && Number.isFinite(state.maxFlows))
              ? state.maxFlows
              : 500,
            maxBodySize: (typeof state.maxBodySize === 'number' && Number.isFinite(state.maxBodySize))
              ? state.maxBodySize
              : 1024,
          };
        }
        return persistedState as SettingsState;
      },
    }
  )
);

export default useSettingsStore;
