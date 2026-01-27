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
    }
  )
);

export default useSettingsStore;
