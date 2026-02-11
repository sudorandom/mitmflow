import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Download, X, ChevronDown, Pin, Trash, StickyNote } from 'lucide-react';
import { Flow, FlowSummary } from '../gen/mitmflow/v1/mitmflow_pb';
import { getFlowTitle } from '../utils';
import FlowIcon from './FlowIcon';
import { StatusPill } from './StatusPill';
import { forwardRef } from 'react';

interface DetailsPanelProps {
  flow: Flow | null;
  summary: FlowSummary | null;
  isLoading?: boolean;
  isMinimized: boolean;
  onClose: () => void;
  panelHeight: number | null;
  setPanelHeight: (height: number) => void;
  children: React.ReactNode;
  downloadFlowContent: (flow: Flow, type: 'har' | 'flow-json' | 'request' | 'response') => void;
  onTogglePin: (flow: Flow | FlowSummary) => void;
  onDeleteFlow: (flow: Flow | FlowSummary) => void;
  onEditNote: () => void;
}

export const DetailsPanel = forwardRef<HTMLDivElement, DetailsPanelProps>(({
  flow,
  summary,
  isLoading,
  isMinimized,
  onClose,
  panelHeight,
  setPanelHeight,
  children,
  downloadFlowContent,
  onTogglePin,
  onDeleteFlow,
  onEditNote,
}, ref) => {
  const [isResizing, setIsResizing] = useState(false);
  const [isDownloadOpen, setDownloadOpen] = useState(false);
  const downloadRef = useRef<HTMLDivElement>(null);

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

  if (!flow && !summary && !isLoading) {
    return null;
  }

  const displayFlow = flow || summary;
  if (!displayFlow) return null;

  const isHttp = flow?.flow.case === 'httpFlow' || summary?.summary.case === 'http';

  return (
    <div
      ref={ref}
      // Make panel focusable so PageUp/PageDown/Arrow keys scroll naturally instead of being captured by FlowTable.
      // Using tabIndex=0 allows click-to-focus and keyboard tab navigation; Escape handling already checks focus containment.
      tabIndex={0}
      role="region"
      aria-label="Flow Details"
      onMouseDown={() => {
        // Ensure focus moves to panel when user clicks anywhere inside so key events apply to scrolling.
        (ref as React.RefObject<HTMLDivElement>)?.current?.focus();
      }}
      className={`relative bg-white dark:bg-zinc-900 border-t border-gray-200 dark:border-zinc-700 flex flex-col flex-shrink-0 transition-all duration-200 ease-out text-gray-900 dark:text-zinc-300 ${
        isMinimized ? 'h-0' : ''
      }`}
      style={{ height: isMinimized ? '0px' : `${panelHeight}px` }}
    >
      <div
        className="absolute top-0 left-0 right-0 h-2 -mt-1 cursor-ns-resize z-50"
        onMouseDown={handleMouseDown}
      />
      <div className="flex items-center p-2.5 px-4 bg-gray-50 dark:bg-zinc-900 border-b border-gray-200 dark:border-zinc-800 flex-shrink-0 gap-3">
        <FlowIcon flow={displayFlow} />
        <button
          onClick={() => displayFlow && onTogglePin(displayFlow)}
          className={`p-1 rounded hover:bg-gray-200 dark:hover:bg-zinc-700 ${displayFlow.pinned ? 'text-orange-500' : 'text-gray-500 dark:text-zinc-500 hover:text-gray-900 dark:hover:text-zinc-200'}`}
          title={displayFlow.pinned ? "Unpin flow" : "Pin flow"}
        >
          <Pin size={20} className={displayFlow.pinned ? "fill-current" : ""} />
        </button>
        <StatusPill
          status={(() => {
            if (flow) {
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
            } else if (summary) {
                if (summary.summary.case === 'http') {
                    return summary.summary.value.statusCode || '...';
                }
                if (summary.summary.case === 'dns' || summary.summary.case === 'tcp' || summary.summary.case === 'udp') {
                    return summary.summary.value.error ? 'ERROR' : 'OK';
                }
                return 'OK';
            }
            return '...';
          })()}
          color={(() => {
            if (flow) {
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
            } else if (summary) {
                if (summary.summary.case === 'http') {
                    const status = summary.summary.value.statusCode;
                    if (!status) return 'gray';
                    if (status >= 500) return 'red';
                    if (status >= 400) return 'red';
                    if (status >= 300) return 'yellow';
                    return 'green';
                }
                if (summary.summary.case === 'dns' || summary.summary.case === 'tcp' || summary.summary.case === 'udp') {
                    return summary.summary.value.error ? 'red' : 'green';
                }
                return 'green';
            }
            return 'gray';
          })()}
        />
        <div className="font-mono text-sm truncate text-gray-700 dark:text-zinc-300">{getFlowTitle(displayFlow)}</div>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => {
              if (window.confirm("Are you sure you want to delete this flow?")) {
                onDeleteFlow(displayFlow);
                onClose();
              }
            }}
            className="p-1 text-zinc-500 hover:text-red-400"
            title="Delete Flow"
          >
            <Trash size={20} />
          </button>
          <button
            onClick={onEditNote}
            className={`p-1 rounded hover:bg-gray-200 dark:hover:bg-zinc-700 ${displayFlow.note ? 'text-blue-500' : 'text-gray-500 dark:text-zinc-500 hover:text-gray-900 dark:hover:text-zinc-200'}`}
            title={displayFlow.note ? "Edit note" : "Add note"}
          >
            <StickyNote size={20} className={displayFlow.note ? "fill-current" : ""} />
          </button>
          <div className="relative" ref={downloadRef}>
            <button
              onClick={() => setDownloadOpen(!isDownloadOpen)}
              disabled={!flow}
              className={`flex items-center gap-1 p-1 ${flow ? 'text-gray-500 dark:text-zinc-500 hover:text-gray-900 dark:hover:text-zinc-200' : 'text-gray-300 dark:text-zinc-700 cursor-not-allowed'}`}
              title="Download"
            >
              <Download size={20} />
              <ChevronDown size={16} />
            </button>
            {isDownloadOpen && flow && (
              <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-md shadow-lg z-50">
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    if (flow) downloadFlowContent(flow, 'request');
                    setDownloadOpen(false);
                  }}
                  className={`block px-4 py-2 text-sm ${isHttp ? 'text-gray-700 dark:text-zinc-200 hover:bg-gray-100 dark:hover:bg-zinc-700' : 'text-gray-400 dark:text-zinc-500 cursor-not-allowed'}`}
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
                  className={`block px-4 py-2 text-sm ${isHttp ? 'text-gray-700 dark:text-zinc-200 hover:bg-gray-100 dark:hover:bg-zinc-700' : 'text-gray-400 dark:text-zinc-500 cursor-not-allowed'}`}
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
                  className={`block px-4 py-2 text-sm ${isHttp ? 'text-gray-700 dark:text-zinc-200 hover:bg-gray-100 dark:hover:bg-zinc-700' : 'text-gray-400 dark:text-zinc-500 cursor-not-allowed'}`}
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
                  className="block px-4 py-2 text-sm text-gray-700 dark:text-zinc-200 hover:bg-gray-100 dark:hover:bg-zinc-700"
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
            className="p-1 text-gray-500 dark:text-zinc-500 hover:text-gray-900 dark:hover:text-zinc-200"
            title="Close"
          >
            <X size={20} />
          </button>
        </div>
      </div>
      {/* Scrollable content area: flex-1 ensures it grows and overflow-auto allows keyboard paging once focused */}
      <div className="flex-1 min-h-0 overflow-auto bg-white dark:bg-zinc-900">
        {!flow ? (
            <div className="flex items-center justify-center h-full text-gray-500 dark:text-zinc-500">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500"></div>
            </div>
        ) : children}
      </div>
    </div>
  );
});
