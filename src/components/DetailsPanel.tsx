import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Download, X, ChevronDown } from 'lucide-react';
import { Flow } from '../gen/mitmflow/v1/mitmflow_pb';
import { getFlowTitle } from '../utils';
import FlowIcon from './FlowIcon';
import { StatusPill } from './StatusPill';

interface DetailsPanelProps {
  flow: Flow | null;
  isMinimized: boolean;
  onClose: () => void;
  panelHeight: number | null;
  setPanelHeight: (height: number) => void;
  children: React.ReactNode;
  downloadFlowContent: (flow: Flow, type: 'har' | 'flow-json' | 'request' | 'response') => void;
}

import { forwardRef } from 'react';

export const DetailsPanel = forwardRef<HTMLDivElement, DetailsPanelProps>(({
  flow,
  isMinimized,
  onClose,
  panelHeight,
  setPanelHeight,
  children,
  downloadFlowContent,
}, ref) => {
  const [isResizing, setIsResizing] = useState(false);
  const [isDownloadOpen, setDownloadOpen] = useState(false);
  const downloadRef = useRef<HTMLDivElement>(null);
  const scrollableContentRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (downloadRef.current && !downloadRef.current.contains(event.target as Node)) {
        setDownloadOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [downloadRef]);



  // Only close on Escape if panel is focused; do not block other keys
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const panelElement = (ref as React.RefObject<HTMLDivElement>)?.current;
      if (e.key === 'Escape' && panelElement && document.activeElement && panelElement.contains(document.activeElement)) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, ref]);

  if (!flow) {
    return null;
  }

  const isHttp = flow.flow.case === 'httpFlow';

  return (
    <div
      ref={ref}
      // Make panel focusable so PageUp/PageDown/Arrow keys scroll naturally instead of being captured by FlowTable.
      // Using tabIndex=0 allows click-to-focus and keyboard tab navigation; Escape handling already checks focus containment.
      tabIndex={-1}
      role="region"
      aria-label="Flow Details"
      onMouseDown={(e) => {
        // Ensure focus moves to panel when user clicks anywhere inside so key events apply to scrolling.
        // Use currentTarget to avoid reliance on closure variable if transformed.
        scrollableContentRef.current?.focus();
      }}
      className={`relative bg-zinc-900 border-t border-zinc-700 flex flex-col flex-shrink-0 transition-all duration-200 ease-out ${
        isMinimized ? 'h-0' : ''
      }`}
      style={{ height: isMinimized ? '0px' : `${panelHeight}px` }}
    >
      <div
        className="absolute top-0 left-0 right-0 h-2 -mt-1 cursor-ns-resize z-50"
        onMouseDown={handleMouseDown}
      />
      <div className="flex items-center p-2.5 px-4 bg-zinc-800 border-b border-zinc-700 flex-shrink-0 gap-3">
        <FlowIcon flow={flow} />
        <StatusPill
          status={(() => {
            if (!flow.flow?.case) return '...';
            if (flow.flow.case === 'httpFlow') {
              return flow.flow.value.response?.statusCode ?? '...';
            }
            if (flow.flow.case === 'dnsFlow') {
              return flow.flow.value.response ? 'OK' : 'ERROR';
            }
            if (flow.flow.case === 'tcpFlow') {
              return flow.flow.value.error ? 'ERROR' : 'OK';
            }
            if (flow.flow.case === 'udpFlow') {
              return flow.flow.value.error ? 'ERROR' : 'OK';
            }
            return '...';
          })()}
          color={(() => {
            if (!flow.flow?.case) return 'gray';
            if (flow.flow.case === 'httpFlow') {
              if (!flow.flow.value.response) return 'gray';
              if (flow.flow.value.response.statusCode >= 500) return 'red';
              if (flow.flow.value.response.statusCode >= 400) return 'red';
              if (flow.flow.value.response.statusCode >= 300) return 'yellow';
              return 'green';
            }
            if (flow.flow.case === 'dnsFlow') {
              return flow.flow.value.response ? 'green' : 'red';
            }
            if (flow.flow.case === 'tcpFlow') {
              return flow.flow.value.error ? 'red' : 'green';
            }
            if (flow.flow.case === 'udpFlow') {
              return flow.flow.value.error ? 'red' : 'green';
            }
            return 'gray';
          })()}
        />
        <div className="font-mono text-sm truncate">{getFlowTitle(flow)}</div>
        <div className="ml-auto flex items-center gap-2">
          <div className="relative" ref={downloadRef}>
            <button
              onClick={() => setDownloadOpen(!isDownloadOpen)}
              className="flex items-center gap-1 p-1 text-zinc-500 hover:text-zinc-200"
              title="Download"
            >
              <Download size={20} />
              <ChevronDown size={16} />
            </button>
            {isDownloadOpen && (
              <div className="absolute right-0 mt-2 w-48 bg-zinc-800 border border-zinc-700 rounded-md shadow-lg z-10">
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    if (flow) downloadFlowContent(flow, 'request');
                    setDownloadOpen(false);
                  }}
                  className={`block px-4 py-2 text-sm ${isHttp ? 'text-zinc-200 hover:bg-zinc-700' : 'text-zinc-500 cursor-not-allowed'}`}
                >
                  Request Body
                </a>
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    if (flow) downloadFlowContent(flow, 'response');
                    setDownloadOpen(false);
                  }}
                  className={`block px-4 py-2 text-sm ${isHttp ? 'text-zinc-200 hover:bg-zinc-700' : 'text-zinc-500 cursor-not-allowed'}`}
                >
                  Response Body
                </a>
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    if (flow) downloadFlowContent(flow, 'har');
                    setDownloadOpen(false);
                  }}
                  className={`block px-4 py-2 text-sm ${isHttp ? 'text-zinc-200 hover:bg-zinc-700' : 'text-zinc-500 cursor-not-allowed'}`}
                >
                  HAR
                </a>
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    if (flow) downloadFlowContent(flow, 'flow-json');
                    setDownloadOpen(false);
                  }}
                  className="block px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-700"
                >
                  JSON
                </a>
              </div>
            )}
          </div>
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
      {/* Scrollable content area: flex-1 ensures it grows and overflow-auto allows keyboard paging once focused */}
      <div ref={scrollableContentRef} tabIndex={0} className="flex-1 min-h-0 overflow-auto focus:outline-none">
        {children}
      </div>
    </div>
  );
});
