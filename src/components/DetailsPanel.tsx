import React, { useCallback, useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { Flow } from '../gen/mitmflow/v1/mitmflow_pb';

interface DetailsPanelProps {
  flow: Flow | null;
  isMinimized: boolean;
  onClose: () => void;
  panelHeight: number | null;
  setPanelHeight: (height: number) => void;
  children: React.ReactNode;
}

export const DetailsPanel: React.FC<DetailsPanelProps> = ({
  flow,
  isMinimized,
  onClose,
  panelHeight,
  setPanelHeight,
  children,
}) => {
  const [isResizing, setIsResizing] = useState(false);

  const handleMouseDown = useCallback(() => {
    setIsResizing(true);
  }, []);

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isResizing) return;
      const newHeight = window.innerHeight - e.clientY;
      setPanelHeight(Math.max(50, newHeight)); // Minimum height of 50px
    },
    [isResizing, setPanelHeight]
  );

  const handleMouseUp = useCallback(() => {
    setIsResizing(false);
  }, []);

  useEffect(() => {
    if (isResizing) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    } else {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, handleMouseMove, handleMouseUp]);

  if (!flow) {
    return null;
  }

  return (
    <div
      className={`relative bg-zinc-900 border-t border-zinc-700 flex flex-col flex-shrink-0 transition-all duration-200 ease-out ${
        isMinimized ? 'h-0' : ''
      }`}
      style={{ height: isMinimized ? '0px' : `${panelHeight}px` }}
    >
      <div
        className="absolute top-0 left-0 right-0 h-2 -mt-1 cursor-ns-resize z-50"
        onMouseDown={handleMouseDown}
      />
      <div className="flex items-center p-2.5 px-4 bg-zinc-800 border-b border-zinc-700 flex-shrink-0">
        <div className="ml-auto flex items-center gap-4">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            className="p-1 text-zinc-500 hover:text-zinc-200"
            title="Close"
          >
            <X size={20} />
          </button>
        </div>
      </div>
      {children}
    </div>
  );
};
