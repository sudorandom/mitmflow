import React, { useEffect } from 'react';
import { X } from 'lucide-react';

interface ToastProps {
  message: string;
  isVisible: boolean;
  onClose: () => void;
  duration?: number;
}

export const Toast: React.FC<ToastProps> = ({ message, isVisible, onClose, duration = 3000 }) => {
  useEffect(() => {
    if (isVisible) {
      const timer = setTimeout(onClose, duration);
      return () => clearTimeout(timer);
    }
  }, [isVisible, duration, onClose]);

  if (!isVisible) return null;

  return (
    <div className="fixed bottom-4 right-4 bg-zinc-800 text-white px-4 py-3 rounded shadow-lg flex items-center gap-3 z-50">
      <span>{message}</span>
      <button onClick={onClose} className="text-zinc-400 hover:text-white">
        <X size={16} />
      </button>
    </div>
  );
};
