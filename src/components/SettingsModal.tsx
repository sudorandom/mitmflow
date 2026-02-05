import React from 'react';
import { X, Moon, Sun, Monitor } from 'lucide-react';
import useSettingsStore, { ThemeMode } from '../settingsStore';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const { theme, setTheme, maxFlows, setMaxFlows, maxBodySize, setMaxBodySize } = useSettingsStore();
  const modalRef = React.useRef<HTMLDivElement>(null);

  // Local state for buffered settings
  const [localMaxFlows, setLocalMaxFlows] = React.useState(maxFlows);
  const [localMaxBodySize, setLocalMaxBodySize] = React.useState(maxBodySize);

  // Sync local state with store when modal opens
  React.useEffect(() => {
    if (isOpen) {
      setLocalMaxFlows(maxFlows);
      setLocalMaxBodySize(maxBodySize);
    }
  }, [isOpen, maxFlows, maxBodySize]);

  // Only close on Escape if modal is open and focused
  React.useEffect(() => {
    if (!isOpen) return;
    setTimeout(() => { modalRef.current?.focus(); }, 0);
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopImmediatePropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown, true); // capture phase
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, onClose]);

  if (!isOpen) {
    return null;
  }

  const handleSave = () => {
    setMaxFlows(localMaxFlows);
    setMaxBodySize(localMaxBodySize);
    onClose();
  };

  const ThemeOption = ({ value, label, icon: Icon }: { value: ThemeMode, label: string, icon: React.ElementType }) => (
    <button
      onClick={() => setTheme(value)}
      className={`flex items-center gap-2 px-4 py-2 rounded-md border text-sm font-medium transition-colors ${
        theme === value
          ? 'bg-orange-500 text-white border-orange-500'
          : 'bg-white dark:bg-zinc-900 text-gray-700 dark:text-zinc-300 border-gray-300 dark:border-zinc-700 hover:bg-gray-50 dark:hover:bg-zinc-800'
      }`}
    >
      <Icon size={16} />
      {label}
    </button>
  );

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center backdrop-blur-sm">
      <div ref={modalRef} tabIndex={0} className="bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-lg shadow-xl p-6 w-full max-w-md">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Settings</h2>
          <button onClick={onClose} className="text-gray-500 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white">
            <X size={20} />
          </button>
        </div>

        <div className="space-y-6">
          {/* Theme Switcher */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-zinc-300 mb-3">
              Theme
            </label>
            <div className="flex gap-2">
              <ThemeOption value="system" label="System" icon={Monitor} />
              <ThemeOption value="light" label="Light" icon={Sun} />
              <ThemeOption value="dark" label="Dark" icon={Moon} />
            </div>
          </div>

          <div>
            <label htmlFor="max-flows" className="block text-sm font-medium text-gray-700 dark:text-zinc-300 mb-2">
              Maximum number of flows to keep
            </label>
            <input
              type="number"
              id="max-flows"
              value={localMaxFlows}
              onChange={(e) => setLocalMaxFlows(Number(e.target.value))}
              className="bg-gray-50 dark:bg-zinc-900 border border-gray-300 dark:border-zinc-700 rounded-md text-gray-900 dark:text-zinc-200 px-3 py-2 w-full focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>
          <div>
            <label htmlFor="max-body-size" className="block text-sm font-medium text-gray-700 dark:text-zinc-300 mb-2">
              Maximum body size to keep (in KB)
            </label>
            <input
              type="number"
              id="max-body-size"
              value={localMaxBodySize}
              onChange={(e) => setLocalMaxBodySize(Number(e.target.value))}
              className="bg-gray-50 dark:bg-zinc-900 border border-gray-300 dark:border-zinc-700 rounded-md text-gray-900 dark:text-zinc-200 px-3 py-2 w-full focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 mt-8">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-zinc-300 bg-white dark:bg-zinc-800 border border-gray-300 dark:border-zinc-700 rounded-md hover:bg-gray-50 dark:hover:bg-zinc-700"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 text-sm font-medium text-white bg-orange-500 border border-orange-500 rounded-md hover:bg-orange-600 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
