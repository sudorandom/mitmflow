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
      migrate: (persistedState: any, version) => {
        if (version === 0) {
          // migration from version 0 to 1
          return {
            ...persistedState,
            maxFlows: persistedState.maxFlows ?? 500,
            maxBodySize: persistedState.maxBodySize ?? 1024,
          };
        }
        return persistedState as SettingsState;
      },
    }
  )
);

export default useSettingsStore;
