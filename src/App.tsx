import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Search, Pause, Play, Download, Braces, HardDriveDownload, Menu, Filter, X, Settings, Trash } from 'lucide-react';
import { createConnectTransport } from "@connectrpc/connect-web";
import { createClient } from "@connectrpc/connect";
import { Service, Flow, FlowSchema } from "./gen/mitmflow/v1/mitmflow_pb";
import { toJson } from "@bufbuild/protobuf";
import { DnsFlowDetails } from './components/DnsFlowDetails';
import { HttpFlowDetails } from './components/HttpFlowDetails';
import { TcpFlowDetails } from './components/TcpFlowDetails';
import { UdpFlowDetails } from './components/UdpFlowDetails';
import { ContentFormat, getFlowId, getTimestamp } from './utils';
import { DetailsPanel } from './components/DetailsPanel';
import FilterModal from './components/FilterModal';
import SettingsModal from './components/SettingsModal';
import useFilterStore from './store';

const getHarContent = (content: Uint8Array | undefined, contentType: string | undefined) => {
  if (!content || content.length === 0) {
    return { text: '', mimeType: contentType || 'application/octet-stream' };
  }
  contentType = contentType || 'application/octet-stream';
  const contentAsString = new TextDecoder().decode(content);

  // Check for common text-based content types
  if (contentType.includes('json') || contentType .includes('xml') || contentType  .includes('text')) {
    return { text: contentAsString, contentType : contentType };
  } else {
    // For other types (binary, image, etc.), base64 encode
    return { text: btoa(String.fromCharCode(...content)), mimeType: contentType, encoding: 'base64' };
  }
};

// New function to generate HAR blob
const generateHarBlob = (flowsToExport: Flow[]): Blob => {
  const har = {
    log: {
      version: "1.2",
      creator: { name: "mitm-flows", version: "1.0" },
      pages: [],
      entries: flowsToExport.flatMap(flow => {
        if (flow?.flow?.case === 'httpFlow') {
          const httpFlow = flow.flow.value;
          return [{
            startedDateTime: new Date(getTimestamp(httpFlow.timestampStart)).toISOString(),
            time: httpFlow.durationMs,
            request: {
              method: httpFlow.request?.method || '',
              url: httpFlow.request?.prettyUrl || httpFlow.request?.url || '',
              httpVersion: httpFlow.request?.httpVersion || 'HTTP/1.1',
              headers: httpFlow.request?.headers ? Object.entries(httpFlow.request.headers).map(([name, value]) => ({ name, value })) : [],
              queryString: httpFlow.request?.url ? new URL(httpFlow.request.url).searchParams : new URLSearchParams(),
              cookies: [],
              postData: getHarContent(httpFlow.request?.content, httpFlow.request?.effectiveContentType)
            },
            response: {
              status: httpFlow.response?.statusCode || 0,
              statusText: httpFlow.response?.reason || 'OK',
              httpVersion: httpFlow.response?.httpVersion || 'HTTP/1.1',
              headers: httpFlow.response?.headers ? Object.entries(httpFlow.response.headers).map(([name, value]) => ({ name, value })) : [],
              cookies: [],
              content: getHarContent(httpFlow.response?.content, httpFlow.response?.effectiveContentType)
            },
            serverIPAddress: httpFlow.server?.addressHost || '',
          }];
        }
        return [];
      })
    }
  };
  return new Blob([JSON.stringify(har, null, 2)], { type: 'application/json;charset=utf-8' });
};

import FlowTable from './components/FlowTable';

// --- MAIN APP COMPONENT ---

declare global {
  interface Window {
    MITMFLOW_GRPC_ADDR?: string;
  }
}

type ConnectionStatus = 'connecting' | 'live' | 'paused' | 'failed';

const App: React.FC = () => {
  const client = useMemo(() => createClient(Service, createConnectTransport({ baseUrl: window.MITMFLOW_GRPC_ADDR || "http://localhost:50051" })), []);
  // --- State ---
  const [flows, setFlows] = useState<Flow[]>([]);
  const [isFlowsTruncated, setIsFlowsTruncated] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('connecting');
  const {
    text: filterText,
    setText: setFilterText,
    flowTypes,
    http,
    clearFilters
  } = useFilterStore();
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
  const [selectedFlow, setSelectedFlow] = useState<Flow | null>(null);
  const [isPanelMinimized, setIsPanelMinimized] = useState(false);
  const [selectedFlowId, setSelectedFlowId] = useState<string | null>(null);
  const [selectedFlowIds, setSelectedFlowIds] = useState<Set<string>>(new Set()); // New state for multi-select
  const [isDragging, setIsDragging] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isBulkDownloadOpen, setIsBulkDownloadOpen] = useState(false); // New state for bulk download menu
  const [detailsPanelHeight, setDetailsPanelHeight] = useState<number | null>(null);
  const [requestFormats, setRequestFormats] = useState<Map<string, ContentFormat>>(new Map());
  const [responseFormats, setResponseFormats] = useState<Map<string, ContentFormat>>(new Map());
  const [isDownloadOpen, setDownloadOpen] = useState(false);
  const [isInfoTooltipOpen, setIsInfoTooltipOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [maxFlows, setMaxFlows] = useState(() => {
    const savedMaxFlows = localStorage.getItem('maxFlows');
    return savedMaxFlows ? Number(savedMaxFlows) : 500;
  });
  const [maxBodySize, setMaxBodySize] = useState(() => {
    const savedMaxBodySize = localStorage.getItem('maxBodySize');
    return savedMaxBodySize ? Number(savedMaxBodySize) : 1024; // 1MB default
  });
  const contentRef = useRef<HTMLDivElement>(null);
  const mainTableRef = useRef<HTMLDivElement>(null); // Ref for the main table scrolling area
  const lastSelectedFlowId = useRef<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const bulkDownloadRef = useRef<HTMLDivElement>(null); // New ref for bulk download menu

  const downloadFlowContent = useCallback((flow: Flow, type: 'har' | 'flow-json' | 'request' | 'response') => {
    const httpFlow = flow.flow.case === 'httpFlow' ? flow.flow.value : null;
    if (!httpFlow) return;

    let blob: Blob;
    let filename: string;

    const requestAsText = (() => {
      if (!httpFlow.request) return '';
      const requestLine = `${httpFlow.request.method} ${httpFlow.request.url} ${httpFlow.request.httpVersion}`;
      const headers = Object.entries(httpFlow.request.headers).map(([k, v]) => `${k}: ${v}`).join('\n');
      return `${requestLine}\n${headers}`;
    })();

    const responseAsText = (() => {
      if (!httpFlow.response) return '';
      const statusLine = `${httpFlow.response.httpVersion} ${httpFlow.response.statusCode}`;
      const headers = Object.entries(httpFlow.response.headers).map(([k, v]) => `${k}: ${v}`).join('\n');
      return `${statusLine}\n${headers}`;
    })();

    switch (type) {
      case 'har':
        blob = generateHarBlob([flow]);
        filename = `${httpFlow.id}.har`;
        break;
      case 'flow-json':
        blob = new Blob([JSON.stringify(toJson(FlowSchema, flow), null, 2)], { type: 'application/json;charset=utf-8' });
        filename = `${httpFlow.id}.json`;
        break;
      case 'request':
        blob = new Blob([requestAsText], { type: 'text/plain;charset=utf-8' });
        filename = `${httpFlow.id}_request.txt`;
        break;
      case 'response':
        blob = new Blob([responseAsText], { type: 'text/plain;charset=utf-8' });
        filename = `${httpFlow.id}_response.txt`;
        break;
      default:
        return;
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, []);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleRowMouseEnter = (flow: Flow) => {
    if (isDragging) {
      const newSelectedFlowIds = new Set(selectedFlowIds);
      if (flow) {
        const flowId = getFlowId(flow);
        if (flowId) {
          newSelectedFlowIds.add(flowId);
        }
      }
      setSelectedFlowIds(newSelectedFlowIds);
    }
  };

  // --- Data Fetching ---
  useEffect(() => {
    if (isPaused) {
      setConnectionStatus('paused');
      return;
    }

    setConnectionStatus('connecting'); // Set to connecting immediately when not paused

    let timeoutId: NodeJS.Timeout;
    let abortController = new AbortController(); // Declare here to be accessible in cleanup

    const attemptConnection = async () => {
      abortController = new AbortController(); // Create a new AbortController for each attempt
      const signal = abortController.signal;

      try {
        const stream = client.streamFlows({}, { signal });
        setConnectionStatus('live'); // Stream established
        for await (const response of stream) {
          if (!response.flow || !response.flow.flow) {
            continue;
          }
          setFlows(prevFlows => {
            if (!response.flow) {
              return prevFlows;
            }
            const incomingFlow = response.flow;

            if (incomingFlow.flow.case === 'httpFlow') {
              const httpFlow = incomingFlow.flow.value;
              const maxBodySizeBytes = maxBodySize * 1024;
              if (httpFlow.request && httpFlow.request.content.length > maxBodySizeBytes) {
                httpFlow.request.content = httpFlow.request.content.slice(0, maxBodySizeBytes);
                httpFlow.request.contentTruncated = true;
              }
              if (httpFlow.response && httpFlow.response.content.length > maxBodySizeBytes) {
                httpFlow.response.content = httpFlow.response.content.slice(0, maxBodySizeBytes);
                httpFlow.response.contentTruncated = true;
              }
            }

            const existingIndex = prevFlows.findIndex(r => {
              const rFlowId = getFlowId(r);
              const incomingFlowId = getFlowId(incomingFlow);
              return rFlowId && incomingFlowId && rFlowId === incomingFlowId;
            });
            if (existingIndex !== -1) {
              const newFlows = [...prevFlows];
              newFlows[existingIndex] = incomingFlow;
              return newFlows;
            }
            const newFlows = [incomingFlow, ...prevFlows.slice(0, maxFlows - 1)];
            if (newFlows.length >= maxFlows) {
              setIsFlowsTruncated(true);
            }
            return newFlows;
          });
        }
        // Stream completed without error, re-attempt after a delay
        if (!isPaused) {
          timeoutId = setTimeout(attemptConnection, 2000); // Re-attempt after 2 seconds
        }
      } catch (err) {
        if (signal.aborted) {
          return;
        }
        console.error(err);
        setConnectionStatus('failed');
        // Retry after a delay if failed and not paused
        if (!isPaused) {
          timeoutId = setTimeout(attemptConnection, 5000); // Retry after 5 seconds on error
        }
      }
    };

    attemptConnection();

    return () => {
      clearTimeout(timeoutId);
      abortController.abort(); // Abort the current connection attempt
    };
  }, [isPaused, maxFlows, maxBodySize]);


  useEffect(() => {
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleMouseUp]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
      if (bulkDownloadRef.current && !bulkDownloadRef.current.contains(event.target as Node)) {
        setIsBulkDownloadOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (detailsPanelHeight === null) {
      setDetailsPanelHeight(window.innerHeight * 0.5);
    }
  }, [detailsPanelHeight]);

  useEffect(() => {
    localStorage.setItem('maxFlows', String(maxFlows));
  }, [maxFlows]);

  useEffect(() => {
    localStorage.setItem('maxBodySize', String(maxBodySize));
  }, [maxBodySize]);

  const activeFilterCount =
    (flowTypes.length > 0 ? 1 : 0) +
    (http.methods.length > 0 ? 1 : 0) +
    (http.contentTypes.length > 0 ? 1 : 0) +
    (http.statusCodes.length > 0 ? 1 : 0);

  // --- Derived State (Filtering) ---
  const filteredFlows = useMemo(() => {
    const filter = filterText.toLowerCase();

    return flows.filter(flow => {
      if (!flow.flow) return false;

      // --- General Text Filter ---
      if (filter) {
        let isMatch = false;
        const clientIp = flow.flow.value?.client?.peernameHost || '';
        const serverIp = flow.flow.value?.server?.addressHost || '';
        if (!flow.flow.case) {
          return false;
        }
        switch (flow.flow.case) {
          case 'httpFlow':
            const httpFlow = flow.flow.value;
            const url = httpFlow.request?.prettyUrl || httpFlow.request?.url || '';
            const sni = httpFlow.client?.sni || '';
            const filterTextHttp = `${url} ${httpFlow.request?.method} ${httpFlow.response?.statusCode} ${sni} ${clientIp} ${serverIp}`.toLowerCase();
            isMatch = filterTextHttp.includes(filter);
            break;
          case 'dnsFlow':
            const dnsFlow = flow.flow.value;
            const domainName = dnsFlow.request?.questions[0]?.name || '';
            isMatch = `${domainName} ${clientIp} ${serverIp}`.toLowerCase().includes(filter);
            break;
          case 'tcpFlow':
            const tcpFlow = flow.flow.value;
            const tcpServer = tcpFlow.server;
            isMatch = `${tcpServer?.addressHost}:${tcpServer?.addressPort} ${clientIp} ${serverIp}`.toLowerCase().includes(filter);
            break;
          case 'udpFlow':
            const udpFlow = flow.flow.value;
            const udpServer = udpFlow.server;
            isMatch = `${udpServer?.addressHost}:${udpServer?.addressPort} ${clientIp} ${serverIp}`.toLowerCase().includes(filter);
            break;
        }
        if (!isMatch) return false;
      }

      // --- Advanced Filters ---
      // Flow Type Filter (OR logic)
      if (flowTypes.length > 0) {
        if (!flow.flow?.case) {
          return false;
        }
        const flowType = flow.flow.case.replace('Flow', '').toLowerCase();
        if (!flowTypes.includes(flowType as any)) {
          return false;
        }
      }

      // HTTP Specific Filters (AND logic)
      if (flow.flow.case === 'httpFlow') {
        const httpFlow = flow.flow.value;

        // HTTP Method Filter
        if (http.methods.length > 0 && !http.methods.includes(httpFlow.request?.method || '')) {
          return false;
        }

        // HTTP Status Code Filter
        if (http.statusCodes.length > 0) {
            const statusCode = httpFlow.response?.statusCode?.toString() || '';
            const matches = http.statusCodes.some(sc => {
                if (sc.endsWith('xx')) {
                    const prefix = sc.slice(0, 1);
                    return statusCode.startsWith(prefix);
                }
                if (sc.includes('-')) {
                    const [start, end] = sc.split('-').map(Number);
                    const code = Number(statusCode);
                    return code >= start && code <= end;
                }
                return statusCode === sc;
            });
            if (!matches) {
                return false;
            }
        }

        // HTTP Content Type Filter
        if (http.contentTypes.length > 0) {
            const reqContentType = httpFlow.request?.effectiveContentType || '';
            const resContentType = httpFlow.response?.effectiveContentType || '';
            const matches = http.contentTypes.some(ct => reqContentType.includes(ct) || resContentType.includes(ct));
            if (!matches) {
                return false;
            }
        }
      }

      return true; // If all filters pass
    });
  }, [flows, filterText, flowTypes, http.methods, http.statusCodes, http.contentTypes]);

  // --- Event Handlers ---
  const handleDownloadSelectedFlows = (format: 'har' | 'json') => {
    const selectedFlows = flows.filter(flow => {
      const flowId = getFlowId(flow);
      return flowId && selectedFlowIds.has(flowId);
    });

    let blob: Blob;
    let filename: string;

    if (format === 'json') {
      const jsonFlows = selectedFlows.map(flow => toJson(FlowSchema, flow));
      blob = new Blob([JSON.stringify(jsonFlows, null, 2)], { type: 'application/json;charset=utf-8' });
      filename = 'flows.json';
    } else {
      blob = generateHarBlob(selectedFlows);
      filename = 'flows.har';
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const togglePause = () => setIsPaused(prev => !prev);
  
  const handleClearFlows = () => {
    setFlows([]); // Clear the main flows array
    setIsFlowsTruncated(false);
    setSelectedFlow(null);
    setSelectedFlowId(null);
    setSelectedFlowIds(new Set());
    setRequestFormats(new Map()); // Clear formats when flows are cleared
    setResponseFormats(new Map()); // Clear formats when flows are cleared
  };

  const handleSetRequestFormat = useCallback((flowId: string, format: ContentFormat) => {
    setRequestFormats(prev => {
      const newMap = new Map(prev);
      newMap.set(flowId, format);
      return newMap;
    });
  }, []);

  const handleSetResponseFormat = useCallback((flowId: string, format: ContentFormat) => {
    setResponseFormats(prev => {
      const newMap = new Map(prev);
      newMap.set(flowId, format);
      return newMap;
    });
  }, []);

  const handleSelectionChanged = (selectedFlows: Flow[]) => {
    const newSelectedFlowIds = new Set(selectedFlows.map(getFlowId).filter((id): id is string => !!id));
    setSelectedFlowIds(newSelectedFlowIds);
  };

  const handleRowClicked = (flow: Flow) => {
    setSelectedFlow(flow);
    setSelectedFlowId(getFlowId(flow));
    setIsPanelMinimized(false);
  };

  const handleFlowMouseDown = useCallback((flow: Flow, event?: React.MouseEvent) => {
    if (event) { // Only set isDragging if it's a mouse event
      setIsDragging(true);
    }
    const newSelectedFlowIds = new Set(selectedFlowIds);
    const currentFlowId = getFlowId(flow);

    if (!currentFlowId) {
      return; // Should not happen if filteredFlows is correct
    }

    if (event?.shiftKey && lastSelectedFlowId.current) {
      const lastIndex = filteredFlows.findIndex(f => {
        const fFlowId = getFlowId(f);
        return fFlowId && fFlowId === lastSelectedFlowId.current;
      });
      const currentIndex = filteredFlows.findIndex(f => {
        const fFlowId = getFlowId(f);
        return fFlowId && fFlowId === currentFlowId;
      });
      const [start, end] = [lastIndex, currentIndex].sort((a, b) => a - b);
      for (let i = start; i <= end; i++) {
        const f = filteredFlows[i];
        if (f) {
            const fFlowId = getFlowId(f);
            if (fFlowId) {
              newSelectedFlowIds.add(fFlowId);
            }
        }
      }
    } else if (event?.metaKey || event?.ctrlKey) {
      if (newSelectedFlowIds.has(currentFlowId)) {
        newSelectedFlowIds.delete(currentFlowId);
      } else {
        newSelectedFlowIds.add(currentFlowId);
      }
    } else {
      newSelectedFlowIds.clear();
      newSelectedFlowIds.add(currentFlowId);
    }

    setSelectedFlowIds(newSelectedFlowIds);
    setSelectedFlow(flow);
    setSelectedFlowId(currentFlowId);
    lastSelectedFlowId.current = currentFlowId;
    setIsPanelMinimized(false);
  }, [filteredFlows, selectedFlowIds]);

  const handleClosePanel = useCallback(() => {
    setSelectedFlow(null);
    setSelectedFlowId(null);
    setDetailsPanelHeight(null); // Reset height when panel is closed
  }, []); // Memoize with useCallback

  // --- Keyboard Navigation Effect ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't navigate if user is typing in the filter input
      if (e.target === document.getElementById('filter-input')) {
        return;
      }

      // If focus is on something outside the flow list (and not the body), do nothing.
      if (document.activeElement && document.activeElement !== document.body) {
        if (mainTableRef.current && !mainTableRef.current.contains(document.activeElement)) {
          return;
        }
      }

      if ((e.metaKey || e.ctrlKey) && e.key === 'a') {
        e.preventDefault();
        const allFlowIds = new Set(filteredFlows.map(f => getFlowId(f)).filter((id): id is string => id !== undefined));
        setSelectedFlowIds(allFlowIds);
        return;
      }

      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown' && e.key !== 'PageUp' && e.key !== 'PageDown') {
        return;
      }
      
      e.preventDefault(); // Prevent page scrolling

      if (filteredFlows.length === 0) {
        return;
      }

      let currentIndex = -1;
      if (selectedFlowId) {
        currentIndex = filteredFlows.findIndex(f => {
          const flowId = getFlowId(f);
          return flowId && flowId === selectedFlowId;
        });
      }

      let nextIndex = -1;
      if (e.key === 'ArrowDown') {
        nextIndex = Math.min(currentIndex + 1, filteredFlows.length - 1);
        if (currentIndex === -1) nextIndex = 0; // Start from top if nothing is selected
      } else if (e.key === 'ArrowUp') { // ArrowUp
        nextIndex = Math.max(currentIndex - 1, 0);
        if (currentIndex === -1) nextIndex = 0; // Start from top if nothing is selected
      } else if (e.key === 'PageDown') {
        nextIndex = Math.min(currentIndex + 10, filteredFlows.length - 1);
        if (currentIndex === -1) nextIndex = 0; // Start from top if nothing is selected
      } else if (e.key === 'PageUp') {
        nextIndex = Math.max(currentIndex - 10, 0);
        if (currentIndex === -1) nextIndex = 0; // Start from top if nothing is selected
      }
      
      if (nextIndex !== currentIndex && nextIndex > -1) {
        const nextFlow = filteredFlows[nextIndex];
        if (nextFlow) {
          // This will update selection and open/update the details panel
          handleFlowMouseDown(nextFlow);
          
          // Scroll the item into view
          const nextFlowId = getFlowId(nextFlow);
          const rowElement = nextFlowId ? mainTableRef.current?.querySelector(`[data-flow-id="${nextFlowId}"]`) : null;
          rowElement?.scrollIntoView({
            behavior: 'smooth',
            block: 'nearest',
          });
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [filteredFlows, selectedFlowId, handleFlowMouseDown]); // Add dependencies

  // --- Close panel on Escape key ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClosePanel();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleClosePanel]);

  return (
    <div className="bg-zinc-900 text-zinc-300 font-sans h-screen flex flex-col">
      {/* --- Header --- */}
      <header className="p-4 border-b border-zinc-700 flex items-center gap-4 flex-shrink-0">
        <h1 className="text-2xl font-semibold text-white">Flows</h1>
        <div className="flex items-center gap-2 ml-2">
          {/* Connection Status Indicator */}
          <div className={`flex items-center justify-center w-28 gap-2 px-3 py-1 rounded-full text-sm font-medium
            ${connectionStatus === 'live' ? 'text-green-400 bg-green-900/50' : ''}
            ${connectionStatus === 'paused' ? 'text-yellow-400 bg-yellow-900/50' : ''}
            ${connectionStatus === 'connecting' ? 'text-blue-400 bg-blue-900/50' : ''}
            ${connectionStatus === 'failed' ? 'text-red-400 bg-red-900/50' : ''}
          `}>
            <span className={`w-2 h-2 rounded-full
              ${connectionStatus === 'live' ? 'bg-green-400 animate-pulse' : ''}
              ${connectionStatus === 'paused' ? 'bg-yellow-400' : ''}
              ${connectionStatus === 'connecting' ? 'bg-blue-400 animate-pulse' : ''}
              ${connectionStatus === 'failed' ? 'bg-red-400' : ''}
            `} />
            {connectionStatus.charAt(0).toUpperCase() + connectionStatus.slice(1)}
          </div>
          <div className="md:hidden relative" ref={menuRef}>
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="bg-zinc-800 border border-zinc-700 text-zinc-200 px-3 py-1 rounded-full text-sm font-medium flex items-center gap-1.5 hover:bg-zinc-700"
            >
              <Menu size={20} />
            </button>
            {isMenuOpen && (
              <div className="absolute right-0 mt-2 w-48 bg-zinc-800 border border-zinc-700 rounded-md shadow-lg z-20">
                <button
                  onClick={() => { togglePause(); setIsMenuOpen(false); }}
                  className="block w-full text-left px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-700 flex items-center gap-1.5"
                >
                  {isPaused ? <Play size={20} /> : <Pause size={20} />}
                  {isPaused ? 'Resume' : 'Pause'}
                </button>
                <button
                  onClick={() => { handleClearFlows(); setIsMenuOpen(false); }}
                  className="block w-full text-left px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-700 flex items-center gap-1.5"
                >
                  <Trash size={20} /> Clear Flows
                </button>
                <div className="relative inline-block w-full" ref={bulkDownloadRef}>
                  <button
                    onClick={(e) => { e.stopPropagation(); setIsBulkDownloadOpen(o => !o); }}
                    disabled={selectedFlowIds.size === 0}
                    className="block w-full text-left px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
                  >
                    <Download size={20} /> Download ({selectedFlowIds.size})
                  </button>
                  {isBulkDownloadOpen && (
                    <div className="absolute left-0 bg-zinc-800 border border-zinc-700 rounded shadow-lg z-10 min-w-[180px] top-full mt-2">
                      <a
                        href="#"
                        onClick={(e) => { e.preventDefault(); handleDownloadSelectedFlows('har'); setIsBulkDownloadOpen(false); setIsMenuOpen(false); }}
                        className="flex items-center gap-3 px-4 py-2.5 text-sm text-zinc-200 hover:bg-zinc-700 hover:text-zinc-200"
                      >
                        <HardDriveDownload size={16} /> Download HAR
                      </a>
                      <a
                        href="#"
                        onClick={(e) => { e.preventDefault(); handleDownloadSelectedFlows('json'); setIsBulkDownloadOpen(false); setIsMenuOpen(false); }}
                        className="flex items-center gap-3 px-4 py-2.5 text-sm text-zinc-200 hover:bg-zinc-700 hover:text-zinc-200"
                      >
                        <Braces size={16} /> Download Flows (JSON)
                      </a>
                    </div>
                  )}
                </div>
                <button
                    onClick={() => setIsSettingsModalOpen(true)}
                    className="block w-full text-left px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
                  >
                    <Settings size={20} /> Settings
                  </button>
                <button
                  
                  className="bg-zinc-800 border border-zinc-700 text-zinc-200 px-3 py-1 rounded-full text-sm font-medium flex items-center gap-1.5 hover:bg-zinc-700"
                >
                  
                </button>
              </div>
            )}
          </div>
          <div className="hidden md:flex items-center gap-2">
            <button
              onClick={togglePause}
              className="bg-zinc-800 border border-zinc-700 text-zinc-200 px-3 py-1 rounded-full text-sm font-medium flex items-center gap-1.5 hover:bg-zinc-700"
            >
              {isPaused ? <Play size={20} /> : <Pause size={20} />}
            </button>
            
            <button
              onClick={handleClearFlows}
              className="bg-zinc-800 border border-zinc-700 text-zinc-200 px-3 py-1 rounded-full text-sm font-medium flex items-center gap-1.5 hover:bg-zinc-700"
            >
              <Trash size={20} />
            </button>
            <button
                onClick={() => setIsSettingsModalOpen(true)}
                className="bg-zinc-800 border border-zinc-700 text-zinc-200 px-3 py-1 rounded-full text-sm font-medium flex items-center gap-1.5 hover:bg-zinc-700"
              >
                <Settings size={20} />
              </button>

            {/* Bulk Download Button with Dropdown */}
            <div className="relative inline-block" ref={bulkDownloadRef}>
              <button
                onClick={(e) => { e.stopPropagation(); setIsBulkDownloadOpen(o => !o); }}
                disabled={selectedFlowIds.size === 0}
                className="bg-zinc-800 border border-zinc-700 text-zinc-200 px-3 py-1 rounded-full text-sm font-medium flex items-center gap-1.5 hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Download size={20} /> {selectedFlowIds.size}
              </button>
              {isBulkDownloadOpen && (
                <div className="absolute right-0 bg-zinc-800 border border-zinc-700 rounded shadow-lg z-50 min-w-[180px] top-full mt-2">
                  <a
                    href="#"
                    onClick={(e) => { e.preventDefault(); handleDownloadSelectedFlows('har'); setIsBulkDownloadOpen(false); }}
                    className="flex items-center gap-3 px-4 py-2.5 text-sm text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200"
                  >
                    <HardDriveDownload size={20} /> Download HAR
                  </a>
                  <a
                    href="#"
                    onClick={(e) => { e.preventDefault(); handleDownloadSelectedFlows('json'); setIsBulkDownloadOpen(false); }}
                    className="flex items-center gap-3 px-4 py-2.5 text-sm text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200"
                  >
                    <Braces size={20} /> Download Flows (JSON)
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>

        {activeFilterCount > 0 && (
          <button
            onClick={() => setIsFilterModalOpen(true)}
            className="bg-zinc-800 border border-zinc-700 text-zinc-200 px-3 py-1 rounded-full text-sm font-medium flex items-center gap-2 hover:bg-zinc-700"
          >
            {activeFilterCount} {activeFilterCount > 1 ? 'Filters' : 'Filter'}
            <div
              onClick={(e) => {
                e.stopPropagation();
                clearFilters();
              }}
              className="bg-zinc-700 rounded-full p-0.5 hover:bg-zinc-600"
            >
              <X size={12} />
            </div>
          </button>
        )}

        {/* Filter Input */}
        <div className="ml-auto relative flex items-center">
          <div className="relative">
            <input
              id="filter-input" // Add id for focus check
              type="text"
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              placeholder="Filter flows..."
              className="bg-zinc-800 border border-zinc-700 rounded-l-full text-zinc-200 px-4 py-1.5 pl-10 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 w-72"
            />
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" />
          </div>
          <button
            onClick={() => setIsFilterModalOpen(true)}
            className="bg-zinc-800 border border-zinc-700 border-l-0 rounded-r-full text-zinc-400 px-3 py-1.5 hover:bg-zinc-700 hover:text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
            data-testid="filter-button"
          >
            <Filter size={20} />
          </button>
        </div>
      </header>

      <FilterModal
        isOpen={isFilterModalOpen}
        onClose={() => setIsFilterModalOpen(false)}
      />

      <SettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        maxFlows={maxFlows}
        setMaxFlows={setMaxFlows}
        maxBodySize={maxBodySize}
        setMaxBodySize={setMaxBodySize}
      />

      {/* --- Flow Table --- */}
      <main className="flex-grow" ref={mainTableRef}> {/* Add ref */}
        <FlowTable
            flows={filteredFlows}
            onSelectionChanged={handleSelectionChanged}
            onRowClicked={handleRowClicked}
        />
      </main>

      {isFlowsTruncated && (
        <footer className="p-2 text-center text-xs text-zinc-500 border-t border-zinc-700">
          Showing the last {flows.length} flows. You can change this limit in the <button onClick={() => setIsSettingsModalOpen(true)} className="underline hover:text-orange-500">settings</button>.
        </footer>
      )}

      {/* --- Details Panel --- */}
      <DetailsPanel
        flow={selectedFlow}
        isMinimized={isPanelMinimized}
        onClose={handleClosePanel}
        panelHeight={detailsPanelHeight}
        setPanelHeight={setDetailsPanelHeight}
      >
        {selectedFlow?.flow?.case === 'httpFlow' && (
          <HttpFlowDetails
            flow={selectedFlow}
            requestFormat={requestFormats.get(selectedFlowId!) || 'auto'}
            setRequestFormat={(format) => handleSetRequestFormat(selectedFlowId!, format)}
            responseFormat={responseFormats.get(selectedFlowId!) || 'auto'}
            setResponseFormat={(format) => handleSetResponseFormat(selectedFlowId!, format)}
            downloadFlowContent={downloadFlowContent}
            isDownloadOpen={isDownloadOpen}
            setDownloadOpen={setDownloadOpen}
            isInfoTooltipOpen={isInfoTooltipOpen}
            setIsInfoTooltipOpen={setIsInfoTooltipOpen}
            contentRef={contentRef}
          />
        )}
        {selectedFlow?.flow?.case === 'dnsFlow' && (
          <DnsFlowDetails flow={selectedFlow} />
        )}
        {selectedFlow?.flow?.case === 'tcpFlow' && (
            <TcpFlowDetails flow={selectedFlow} />
        )}
        {selectedFlow?.flow?.case === 'udpFlow' && (
            <UdpFlowDetails flow={selectedFlow} />
        )}
      </DetailsPanel>
    </div>
  );
};

export default App;
