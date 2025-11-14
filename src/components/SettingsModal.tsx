import React from 'react';
import { X } from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  maxFlows: number;
  setMaxFlows: (maxFlows: number) => void;
  maxBodySize: number;
  setMaxBodySize: (maxBodySize: number) => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, maxFlows, setMaxFlows, maxBodySize, setMaxBodySize }) => {

  const modalRef = React.useRef<HTMLDivElement>(null);

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

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
      <div ref={modalRef} tabIndex={0} className="bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl p-6 w-full max-w-md">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-white">Settings</h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-white">
            <X size={20} />
          </button>
        </div>
        <div>
          <label htmlFor="max-flows" className="block text-sm font-medium text-zinc-300 mb-2">
            Maximum number of flows to keep
          </label>
          <input
            type="number"
            id="max-flows"
            value={maxFlows}
            onChange={(e) => setMaxFlows(Number(e.target.value))}
            className="bg-zinc-900 border border-zinc-700 rounded-md text-zinc-200 px-3 py-2 w-full focus:outline-none focus:ring-2 focus:ring-orange-500"
          />
        </div>
        <div className="mt-4">
          <label htmlFor="max-body-size" className="block text-sm font-medium text-zinc-300 mb-2">
            Maximum body size to keep (in KB)
          </label>
          <input
            type="number"
            id="max-body-size"
            value={maxBodySize}
            onChange={(e) => setMaxBodySize(Number(e.target.value))}
            className="bg-zinc-900 border border-zinc-700 rounded-md text-zinc-200 px-3 py-2 w-full focus:outline-none focus:ring-2 focus:ring-orange-500"
          />
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
