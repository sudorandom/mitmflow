import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Search, Pause, Play, Download, Braces, HardDriveDownload, Menu, Filter, X, Settings, Trash, ChevronDown } from 'lucide-react';
import { createConnectTransport } from "@connectrpc/connect-web";
import { createClient } from "@connectrpc/connect";
import { Flow, FlowSummary, FlowSchema, ExportFormat, Service, FlowFilterSchema, GetFlowsRequestSchema, StreamFlowsRequestSchema } from "./gen/mitmflow/v1/mitmflow_pb";
import { toJson, create } from "@bufbuild/protobuf";
import { DnsFlowDetails } from './components/DnsFlowDetails';
import { HttpFlowDetails } from './components/HttpFlowDetails';
import { TcpFlowDetails } from './components/TcpFlowDetails';
import { UdpFlowDetails } from './components/UdpFlowDetails';
import { ContentFormat, getFlowId, getFlowTimestampNs } from './utils';
import { DetailsPanel } from './components/DetailsPanel';
import FilterModal from './components/FilterModal';
import NoteModal from './components/NoteModal';
import SettingsModal from './components/SettingsModal';
import useFilterStore, { FlowType } from './store';
import useSettingsStore from './settingsStore';
import FlowTable from './components/FlowTable';
import { Toast } from './components/Toast';
import { useDebounce } from './hooks/useDebounce';


// --- MAIN APP COMPONENT ---

declare global {
  interface Window {
    MITMFLOW_GRPC_ADDR?: string;
  }
}

type ConnectionStatus = 'connecting' | 'live' | 'paused' | 'failed' | 'reconnecting';

const App: React.FC = () => {
  // Use relative URL - in dev mode Vite proxies to backend, in production both are served from same origin
  const client = useMemo(() => createClient(Service, createConnectTransport({ baseUrl: window.MITMFLOW_GRPC_ADDR || "." })), []);
  // --- State ---
  const [flowState, setFlowState] = useState<{ all: FlowSummary[]; filtered: FlowSummary[]; newIds: Set<string> }>({ all: [], filtered: [], newIds: new Set() });
  const [detailsFlow, setDetailsFlow] = useState<Flow | null>(null);
  const [selectedFlowSummary, setSelectedFlowSummary] = useState<FlowSummary | null>(null);
  const newFlowsMap = useRef<Map<string, number>>(new Map());
  const [isFlowsTruncated, setIsFlowsTruncated] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('connecting');
  const latestTimestampNs = useRef<bigint>(BigInt(0));
  const {
    text: filterText,
    setText: setFilterText,
    pinned,
    setPinned,
    hasNote,
    setHasNote,
    flowTypes,
    setFlowTypes,
    clientIps,
    setClientIps,
    http,
    setHttpMethods,
    setHttpContentTypes,
    setHttpStatusCodes,
    clearFilters
  } = useFilterStore();

  const debouncedFilterText = useDebounce(filterText, 300);

  // Settings from store
  const { theme, maxFlows: storedMaxFlows } = useSettingsStore();
  // Ensure maxFlows is a valid number, defaulting to 500 if undefined or invalid (e.g. NaN from old local storage)
  const maxFlows = Number.isFinite(storedMaxFlows) ? storedMaxFlows : 500;

  // Load from URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    if (params.has('q')) {
      setFilterText(params.get('q') || '');
    }
    if (params.has('pinned')) {
      const pinnedVal = params.get('pinned');
      if (pinnedVal === 'true') {
        setPinned(true);
      } else if (pinnedVal === 'false') {
        setPinned(false);
      }
    }
    if (params.has('hasNote')) {
        const hasNoteVal = params.get('hasNote');
        if (hasNoteVal === 'true') {
            setHasNote(true);
        } else if (hasNoteVal === 'false') {
            setHasNote(false);
        }
    }
    if (params.has('type')) {
      const types = params.get('type')?.split(',') as FlowType[];
      setFlowTypes(types || []);
    }
    if (params.has('client_ip')) {
      setClientIps(params.get('client_ip')?.split(',') || []);
    }
    if (params.has('method')) {
      setHttpMethods(params.get('method')?.split(',') || []);
    }
    if (params.has('status')) {
      setHttpStatusCodes(params.get('status')?.split(',') || []);
    }
    if (params.has('content')) {
      setHttpContentTypes(params.get('content')?.split(',') || []);
    }
  }, []);

  // Update URL
  useEffect(() => {
    const params = new URLSearchParams();
    if (filterText) params.set('q', filterText);
    if (pinned === true) {
      params.set('pinned', 'true');
    } else if (pinned === false) {
      params.set('pinned', 'false');
    }
    if (hasNote === true) {
      params.set('hasNote', 'true');
    } else if (hasNote === false) {
      params.set('hasNote', 'false');
    }
    if (flowTypes.length > 0) params.set('type', flowTypes.join(','));
    if (clientIps.length > 0) params.set('client_ip', clientIps.join(','));
    if (http.methods.length > 0) params.set('method', http.methods.join(','));
    if (http.statusCodes.length > 0) params.set('status', http.statusCodes.join(','));
    if (http.contentTypes.length > 0) params.set('content', http.contentTypes.join(','));

    const newUrl = params.toString() ? `?${params.toString()}` : window.location.pathname;
    window.history.replaceState(null, '', newUrl);
  }, [filterText, pinned, hasNote, flowTypes, clientIps, http]);

  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
  const [isNoteModalOpen, setIsNoteModalOpen] = useState(false);
  const handleCloseFilterModal = useCallback(() => setIsFilterModalOpen(false), []);
  const handleCloseSettingsModal = useCallback(() => setIsSettingsModalOpen(false), []);
  const [isPanelMinimized, setIsPanelMinimized] = useState(false);
  const [selectedFlowId, setSelectedFlowId] = useState<string | null>(null);
  const [selectedFlowIds, setSelectedFlowIds] = useState<Set<string>>(new Set()); // New state for multi-select
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isDeleteMenuOpen, setIsDeleteMenuOpen] = useState(false); // New state for delete menu
  const [isBulkDownloadOpen, setIsBulkDownloadOpen] = useState(false); // New state for bulk download menu
  const [detailsPanelHeight, setDetailsPanelHeight] = useState<number | null>(400);
  const [requestFormats, setRequestFormats] = useState<Map<string, ContentFormat>>(new Map());
  const [responseFormats, setResponseFormats] = useState<Map<string, ContentFormat>>(new Map());
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [toast, setToast] = useState<{ message: string; visible: boolean } | null>(null);
  const [lastSelectedTabs, setLastSelectedTabs] = useState<Record<string, string>>({});

  const showToast = useCallback((message: string) => {
    setToast({ message, visible: true });
  }, []);

  const hideToast = useCallback(() => {
    setToast(prev => prev ? { ...prev, visible: false } : null);
  }, []);


  // Theme application
  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove('light', 'dark');

    if (theme === 'system') {
        const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
        root.classList.add(systemTheme);
    } else {
        root.classList.add(theme);
    }
  }, [theme]);

  // Watch for system preference changes if theme is 'system'
  useEffect(() => {
    if (theme !== 'system') return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e: MediaQueryListEvent) => {
        const root = window.document.documentElement;
        root.classList.remove('light', 'dark');
        root.classList.add(e.matches ? 'dark' : 'light');
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [theme]);


  const contentRef = useRef<HTMLDivElement>(null);
  const mainTableRef = useRef<HTMLDivElement>(null); // Ref for the main table scrolling area
  const lastSelectedFlowId = useRef<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const deleteMenuRef = useRef<HTMLDivElement>(null); // Ref for delete menu
  const bulkDownloadRef = useRef<HTMLDivElement>(null); // New ref for bulk download menu

  const downloadFlowContent = useCallback(async (flow: Flow, type: 'har' | 'flow-json' | 'request' | 'response') => {
    const httpFlow = flow.flow.case === 'httpFlow' ? flow.flow.value : null;
    const flowId = getFlowId(flow);

    let blob: Blob;
    let filename: string;

    if (type === 'flow-json') {
      blob = new Blob([JSON.stringify(toJson(FlowSchema, flow), null, 2)], { type: 'application/json;charset=utf-8' });
      filename = `${flowId}.json`;
    } else if (type === 'har') {
      if (!flowId) return;
      try {
        const response = await client.exportFlows({
          flowIds: [flowId],
          format: ExportFormat.HAR,
        });
        if (response.data) {
          blob = new Blob([response.data as any], { type: 'application/json' });
          filename = response.filename || `${flowId}.har`;
        } else {
          return;
        }
      } catch (err) {
        console.error("Failed to export flow as HAR", err);
        showToast("Failed to export flow as HAR");
        return;
      }
    } else {
      if (!httpFlow) return;

      const requestAsText = (() => {
        if (!httpFlow.request) return '';
        const requestLine = `${httpFlow.request.method} ${httpFlow.request.url} ${httpFlow.request.httpVersion}`;
        const headers = Object.entries(httpFlow.request.headers).map(([k, v]) => `${k}: ${v}`).join('\n');
        const body = httpFlow.request.content ? new TextDecoder().decode(httpFlow.request.content) : '';
        return `${requestLine}\n${headers}\n\n${body}`;
      })();
  
      const responseAsText = (() => {
        if (!httpFlow.response) return '';
        const statusLine = `${httpFlow.response.httpVersion} ${httpFlow.response.statusCode}`;
        const headers = Object.entries(httpFlow.response.headers).map(([k, v]) => `${k}: ${v}`).join('\n');
        const body = httpFlow.response.content ? new TextDecoder().decode(httpFlow.response.content) : '';
        return `${statusLine}\n${headers}\n\n${body}`;
      })();

      switch (type) {
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
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [client, showToast]);

  const flowBuffer = useRef<FlowSummary[]>([]);

  const processIncomingFlow = useCallback((incomingFlow: FlowSummary) => {
    flowBuffer.current.push(incomingFlow);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      let hasExpired = false;

      // Check for expired highlights
      for (const [id, ts] of newFlowsMap.current) {
        if (now - ts > 2000) {
          newFlowsMap.current.delete(id);
          hasExpired = true;
        }
      }

      if (flowBuffer.current.length === 0 && !hasExpired) {
        return;
      }

      const flowsToProcess = flowBuffer.current;
      flowBuffer.current = [];

      setFlowState(prevState => {
        let newAll = [...prevState.all];

        if (flowsToProcess.length > 0) {
           const flowIdMap = new Map<string, number>();
           newAll.forEach((f, i) => {
             const id = f.id;
             if (id) flowIdMap.set(id, i);
           });

           const addedFlowsMap = new Map<string, FlowSummary>();

           for (const incomingFlow of flowsToProcess) {
             const incomingFlowId = incomingFlow.id;

             const flowTs = getFlowTimestampNs(incomingFlow);
             if (flowTs > latestTimestampNs.current) {
               latestTimestampNs.current = flowTs;
             }

             if (incomingFlowId && flowIdMap.has(incomingFlowId)) {
               const idx = flowIdMap.get(incomingFlowId)!;
               newAll[idx] = incomingFlow;
             } else if (incomingFlowId && addedFlowsMap.has(incomingFlowId)) {
               addedFlowsMap.set(incomingFlowId, incomingFlow);
             } else {
               if (incomingFlowId) {
                  addedFlowsMap.set(incomingFlowId, incomingFlow);
                  newFlowsMap.current.set(incomingFlowId, now);
               }
             }
           }

           if (addedFlowsMap.size > 0) {
              const addedFlows = Array.from(addedFlowsMap.values()).reverse();
              newAll = [...addedFlows, ...newAll];
           }
        }

        if (newAll.length > maxFlows) {
          const excessCount = newAll.length - maxFlows;
          const droppedFlows = newAll.splice(newAll.length - excessCount, excessCount);
          setIsFlowsTruncated(true);

          const droppedIds = new Set(droppedFlows.map(f => f.id).filter((id): id is string => !!id));

          if (droppedIds.size > 0) {
            // Remove dropped IDs from newFlowsMap
            for (const id of droppedIds) {
                newFlowsMap.current.delete(id);
            }

            setSelectedFlowIds(prev => {
              let changed = false;
              const newSet = new Set(prev);
              for (const id of droppedIds) {
                if (newSet.has(id)) {
                  newSet.delete(id);
                  changed = true;
                }
              }
              return changed ? newSet : prev;
            });
          }
        }
        
        return {
            all: newAll,
            filtered: newAll,
            newIds: new Set(newFlowsMap.current.keys())
        };
      });
    }, 500);

    return () => clearInterval(interval);
  }, [maxFlows]);

  // --- Data Fetching ---
  const filter = useMemo(() => create(FlowFilterSchema, {
      filterText: debouncedFilterText,
      pinned,
      hasNote,
      flowTypes,
      clientIps,
      http: {
        methods: http.methods,
        contentTypes: http.contentTypes,
        statusCodes: http.statusCodes,
      },
  }), [debouncedFilterText, pinned, hasNote, flowTypes, clientIps, http]);

  const processHistoryFlow = useCallback((incomingFlow: FlowSummary) => {
    setFlowState(prevState => {
      const flowTs = getFlowTimestampNs(incomingFlow);
      if (flowTs > latestTimestampNs.current) {
        latestTimestampNs.current = flowTs;
      }

      // Similar logic to the batched processing, but applied synchronously
      const incomingFlowId = incomingFlow.id;
      const existingIndex = prevState.all.findIndex(r => r.id === incomingFlowId);
      
      const newAll = [...prevState.all];
      if (existingIndex !== -1) {
        newAll[existingIndex] = incomingFlow;
      } else {
        newAll.push(incomingFlow); // History flows are pushed to the end
      }

      return { all: newAll, filtered: newAll, newIds: prevState.newIds };
    });
  }, []);

  useEffect(() => {
    // Reset state on filter change
    latestTimestampNs.current = BigInt(0);
    setFlowState({ all: [], filtered: [], newIds: new Set() });
    newFlowsMap.current.clear();
    setIsFlowsTruncated(false);
    setSelectedFlowId(null);
    setSelectedFlowIds(new Set());
    setConnectionStatus('connecting');

    const abortController = new AbortController();
    const signal = abortController.signal;

    const fetchHistory = async (retryCount = 0) => {
       try {
         const req = create(GetFlowsRequestSchema, {
           filter,
           limit: maxFlows,
         });
         const stream = client.getFlows(req, { signal });
         for await (const res of stream) {
             if (res.flow) {
                 processHistoryFlow(res.flow); // Use synchronous processor
             }
         }
       } catch (err) {
         if (!signal.aborted) {
            console.error("History fetch error:", err);
            if (retryCount < 5) {
                setConnectionStatus('reconnecting');
                setTimeout(() => fetchHistory(retryCount + 1), 2000);
            } else {
                setConnectionStatus('failed');
            }
         }
       }
    };

    fetchHistory();

    return () => {
        abortController.abort();
    };
  }, [filter, maxFlows, client, processHistoryFlow]);

  useEffect(() => {
      if (isPaused) {
          setConnectionStatus('paused');
          return;
      }

      const abortController = new AbortController();
      const signal = abortController.signal;
      let retryTimeout: NodeJS.Timeout;

      const subscribeLive = async () => {
          if (signal.aborted) return;
          try {
              const req = create(StreamFlowsRequestSchema, {
                  sinceTimestampNs: latestTimestampNs.current,
                  filter,
              });
              const stream = client.streamFlows(req, { signal });
              setConnectionStatus('live');

              for await (const res of stream) {
                  if (res.response.case === 'flow') {
                      processIncomingFlow(res.response.value); // Use batched processor
                  }
              }
              if (!signal.aborted) {
                  retryTimeout = setTimeout(subscribeLive, 2000);
              }
          } catch (err) {
              if (signal.aborted) return;
              console.error("Live stream error:", err);
              setConnectionStatus('reconnecting');
              retryTimeout = setTimeout(subscribeLive, 2000);
          }
      };

      subscribeLive();

      return () => {
          abortController.abort();
          clearTimeout(retryTimeout);
      };
  }, [filter, isPaused, client, processIncomingFlow]);

  // --- Derived State (Filtering) ---
  const filteredFlows = flowState.filtered;

  const activeFilterCount =
    (pinned !== undefined ? 1 : 0) +
    (hasNote !== undefined ? 1 : 0) +
    (flowTypes.length > 0 ? 1 : 0) +
    (clientIps.length > 0 ? 1 : 0) +
    (http.methods.length > 0 ? 1 : 0) +
    (http.contentTypes.length > 0 ? 1 : 0) +
    (http.statusCodes.length > 0 ? 1 : 0);

  const uniqueClientIps = useMemo(() => {
    const ips = new Set<string>();
    flowState.all.forEach(flow => {
        let ip: string | undefined;
        switch (flow.summary.case) {
            case 'http': ip = flow.summary.value.clientPeernameHost; break;
            case 'dns': ip = flow.summary.value.clientPeernameHost; break;
            case 'tcp': ip = flow.summary.value.clientPeernameHost; break;
            case 'udp': ip = flow.summary.value.clientPeernameHost; break;
        }
        if (ip) ips.add(ip);
    });
    return Array.from(ips).sort();
  }, [flowState.all]);

  const getFlowType = (flow: Flow | null): string => {
    if (!flow?.flow?.case) return 'unknown';
    if (flow.flow.case === 'httpFlow' && flow.flow.value.isWebsocket) {
      return 'websocket';
    }
    return flow.flow.case;
  }

  // --- Event Handlers ---
  const handleDownloadSelectedFlows = async (format: 'har' | 'json') => {
    const ids = Array.from(selectedFlowIds);
    if (ids.length === 0) return;

    try {
      const exportFormat = format === 'har' 
        ? ExportFormat.HAR 
        : ExportFormat.JSON;
      
      const response = await client.exportFlows({
        flowIds: ids,
        format: exportFormat,
      });

      if (response.data) {
        const blob = new Blob([response.data as any], { type: format === 'har' ? 'application/json' : 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = response.filename || `flows.${format}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      console.error("Failed to export flows", err);
      showToast(`Failed to export flows: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const togglePause = () => setIsPaused(prev => !prev);
  
  const handleClearFlows = () => {
    setFlowState({ all: [], filtered: [], newIds: new Set() }); // Clear the main flows array
    newFlowsMap.current.clear();
    setIsFlowsTruncated(false);
    setSelectedFlowId(null);
    setDetailsFlow(null);
    setSelectedFlowIds(new Set());
    setRequestFormats(new Map()); // Clear formats when flows are cleared
    setResponseFormats(new Map()); // Clear formats when flows are cleared
    setIsDeleteMenuOpen(false);
  };

  const handleDeleteSelectedFlows = async () => {
    const ids = Array.from(selectedFlowIds);
    if (ids.length === 0) return;
    try {
      await client.deleteFlows({ flowIds: ids });
      setFlowState(prev => ({
        all: prev.all.filter(f => !ids.includes(f.id)),
        filtered: prev.filtered.filter(f => !ids.includes(f.id)),
        newIds: prev.newIds
      }));
      if (detailsFlow && ids.includes(getFlowId(detailsFlow) || '')) {
          setDetailsFlow(null);
          setSelectedFlowId(null);
      }
      setSelectedFlowIds(new Set());
    } catch (err) {
      console.error("Failed to delete selected flows", err);
    }
    setIsDeleteMenuOpen(false);
  };

  const handleDeleteAllFlows = async () => {
    if (!window.confirm("Are you sure you want to delete all flows? This cannot be undone.")) {
      setIsDeleteMenuOpen(false);
      return;
    }
    try {
      await client.deleteFlows({ all: true });
      const pinnedFlows = flowState.all.filter(f => f.pinned);
      if (pinnedFlows.length > 0) {
        setFlowState({
          all: pinnedFlows,
          filtered: pinnedFlows,
          newIds: new Set()
        });
        showToast("Pinned flows were not deleted. Select and delete them explicitly to remove.");
      } else {
        handleClearFlows();
      }
    } catch (err) {
      console.error("Failed to delete all flows", err);
    }
    setIsDeleteMenuOpen(false);
  };

  const handleDeleteFlow = useCallback(async (flow: Flow | FlowSummary) => {
    const flowId = getFlowId(flow);
    if (!flowId) return;
    try {
      await client.deleteFlows({ flowIds: [flowId] });
      setFlowState(prev => ({
        all: prev.all.filter(f => f.id !== flowId),
        filtered: prev.filtered.filter(f => f.id !== flowId),
        newIds: prev.newIds
      }));
      if (selectedFlowId === flowId) {
        setSelectedFlowId(null);
        setDetailsFlow(null);
      }
      setSelectedFlowIds(prev => {
        const newSet = new Set(prev);
        newSet.delete(flowId);
        return newSet;
      });
    } catch (err) {
      console.error("Failed to delete flow", err);
    }
  }, [client, selectedFlowId]);

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

  const handleUpdateFlow = useCallback(async (flowId: string, updates: { pinned?: boolean, note?: string }) => {
    try {
      const res = await client.updateFlow({ flowId, ...updates });
      
      setFlowState(prev => {
          const newAll = prev.all.map(f => f.id === flowId ? res.flow! : f);
          return { ...prev, all: newAll, filtered: newAll }; // Note: filtering update logic is imperfect here but acceptable for now
      });

      if (detailsFlow && getFlowId(detailsFlow) === flowId) {
          // Update details flow if it's currently selected.
          // Since UpdateFlow returns summary, we might not want to replace the full flow with summary.
          // Just update the metadata fields.
          setDetailsFlow(prev => {
              if (!prev) return null;
              // We need to clone and update
              // Ideally backend returns full flow on update, or we re-fetch.
              // Or we manually patch. Since pinned/note are top-level on Flow and FlowSummary, it works.
              // But Flow is immutable message object usually? No, in Connect/Buf it's standard JS object.
              // Let's rely on re-fetching or patching.
              return { ...prev, pinned: res.flow?.pinned ?? prev.pinned, note: res.flow?.note ?? prev.note } as Flow;
          });
      }

      if (updates.pinned === true) {
        showToast("Flow pinned. It will not be deleted automatically.");
      }
    } catch (err) {
      console.error("Failed to update flow", err);
    }
  }, [client, showToast, detailsFlow]);

  const handleTogglePin = useCallback(async (flow: Flow | FlowSummary) => {
    const flowId = getFlowId(flow);
    if (!flowId) return;
    handleUpdateFlow(flowId, { pinned: !flow.pinned });
  }, [handleUpdateFlow]);

  const handleFlowSelection = useCallback(async (flow: FlowSummary) => {
    const currentFlowId = flow.id;
    if (!currentFlowId) return;

    setSelectedFlowId(currentFlowId);
    setSelectedFlowSummary(flow);
    setDetailsFlow(null); // Clear previous details while loading new ones
    lastSelectedFlowId.current = currentFlowId;
    setIsPanelMinimized(false);
    
    // Fetch full flow details
    try {
        const res = await client.getFlow({ flowId: currentFlowId });
        if (res.flow) {
            setDetailsFlow(res.flow);
        }
    } catch (err) {
        console.error("Failed to fetch flow details", err);
        showToast("Failed to load flow details");
    }
  }, [client, showToast]);

  const handleClosePanel = useCallback(() => {
    setSelectedFlowId(null);
    setSelectedFlowSummary(null);
    setDetailsFlow(null);
    setDetailsPanelHeight(null); // Reset height when panel is closed
  }, []); // Memoize with useCallback


  return (
    <div className="bg-white dark:bg-zinc-900 text-gray-900 dark:text-zinc-300 font-sans h-screen flex flex-col">
      {/* --- Header --- */}
      <header className="p-4 border-b border-gray-200 dark:border-zinc-700 flex items-center gap-4 flex-shrink-0 bg-white dark:bg-zinc-900">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Flows</h1>
        <div className="flex items-center gap-2 ml-2">
          {/* Connection Status Indicator */}
          <div className={`flex items-center justify-center gap-2 px-3 py-1 rounded-full text-sm font-medium
            ${connectionStatus === 'live' ? 'text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900/50' : ''}
            ${connectionStatus === 'paused' ? 'text-yellow-600 dark:text-yellow-400 bg-yellow-100 dark:bg-yellow-900/50' : ''}
            ${connectionStatus === 'connecting' ? 'text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/50' : ''}
            ${connectionStatus === 'reconnecting' ? 'text-orange-600 dark:text-orange-400 bg-orange-100 dark:bg-orange-900/50' : ''}
            ${connectionStatus === 'failed' ? 'text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/50' : ''}
          `}>
            <span className={`w-2 h-2 rounded-full align-middle
              ${connectionStatus === 'live' ? 'bg-green-500 dark:bg-green-400 animate-pulse' : ''}
              ${connectionStatus === 'paused' ? 'bg-yellow-500 dark:bg-yellow-400' : ''}
              ${connectionStatus === 'connecting' ? 'bg-blue-500 dark:bg-blue-400 animate-pulse' : ''}
              ${connectionStatus === 'reconnecting' ? 'bg-orange-500 dark:bg-orange-400 animate-pulse' : ''}
              ${connectionStatus === 'failed' ? 'bg-red-500 dark:bg-red-400' : ''}
            `} />
            {connectionStatus === 'reconnecting' ? 'Reconnecting' : connectionStatus.charAt(0).toUpperCase() + connectionStatus.slice(1)}
          </div>
          <div className="md:hidden relative" ref={menuRef}>
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="bg-gray-100 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 text-gray-700 dark:text-zinc-200 px-3 py-1 rounded-full text-sm font-medium flex items-center gap-1.5 hover:bg-gray-200 dark:hover:bg-zinc-700"
            >
              <Menu size={20} />
            </button>
            {isMenuOpen && (
              <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-md shadow-lg z-20">
                <button
                  onClick={() => { togglePause(); setIsMenuOpen(false); }}
                  className="block w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-zinc-200 hover:bg-gray-100 dark:hover:bg-zinc-700 flex items-center gap-1.5"
                >
                  {isPaused ? <Play size={20} /> : <Pause size={20} />}
                  {isPaused ? 'Resume' : 'Pause'}
                </button>
                <div className="border-t border-zinc-700 my-1"></div>
                 <button
                    onClick={() => { handleClearFlows(); setIsMenuOpen(false); }}
                    className="block w-full text-left px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-700 flex items-center gap-1.5"
                  >
                    Clear View
                  </button>
                   <button
                    onClick={() => { handleDeleteSelectedFlows(); setIsMenuOpen(false); }}
                    disabled={selectedFlowIds.size === 0}
                    className="block w-full text-left px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
                  >
                    Delete Selected ({selectedFlowIds.size})
                  </button>
                   <button
                    onClick={() => { handleDeleteAllFlows(); setIsMenuOpen(false); }}
                    className="block w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-zinc-700 flex items-center gap-1.5"
                  >
                    Delete All
                  </button>
                <div className="border-t border-zinc-700 my-1"></div>
                <div className="relative inline-block w-full" ref={bulkDownloadRef}>
                  <button
                    onClick={(e) => { e.stopPropagation(); setIsBulkDownloadOpen(o => !o); }}
                    disabled={selectedFlowIds.size === 0}
                    className="block w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-zinc-200 hover:bg-gray-100 dark:hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
                  >
                    <Download size={20} /> Download ({selectedFlowIds.size})
                  </button>
                  {isBulkDownloadOpen && (
                    <div className="absolute left-0 bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded shadow-lg z-10 min-w-[180px] top-full mt-2">
                      <a
                        href="#"
                        onClick={(e) => { e.preventDefault(); handleDownloadSelectedFlows('har'); setIsBulkDownloadOpen(false); setIsMenuOpen(false); }}
                        className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-zinc-200 hover:bg-gray-100 dark:hover:bg-zinc-700"
                      >
                        <HardDriveDownload size={16} /> Download HAR
                      </a>
                      <a
                        href="#"
                        onClick={(e) => { e.preventDefault(); handleDownloadSelectedFlows('json'); setIsBulkDownloadOpen(false); setIsMenuOpen(false); }}
                        className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-zinc-200 hover:bg-gray-100 dark:hover:bg-zinc-700"
                      >
                        <Braces size={16} /> Download Flows (JSON)
                      </a>
                    </div>
                  )}
                </div>
                <button
                    onClick={() => setIsSettingsModalOpen(true)}
                    className="block w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-zinc-200 hover:bg-gray-100 dark:hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
                  >
                    <Settings size={20} /> Settings
                  </button>
                <button
                  
                  className="bg-gray-100 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 text-gray-700 dark:text-zinc-200 px-3 py-1 rounded-full text-sm font-medium flex items-center gap-1.5 hover:bg-gray-200 dark:hover:bg-zinc-700"
                >
                  
                </button>
              </div>
            )}
          </div>
          <div className="hidden md:flex items-center gap-2">
            <button
              onClick={togglePause}
              className="bg-gray-100 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 text-gray-700 dark:text-zinc-200 px-3 py-1 rounded-full text-sm font-medium flex items-center gap-1.5 hover:bg-gray-200 dark:hover:bg-zinc-700"
            >
              {isPaused ? <Play size={20} /> : <Pause size={20} />}
            </button>
            
            {/* Delete Dropdown */}
            <div className="relative inline-block" ref={deleteMenuRef}>
              <button
                onClick={() => setIsDeleteMenuOpen(!isDeleteMenuOpen)}
                aria-label="Delete options"
                className="bg-zinc-800 border border-zinc-700 text-zinc-200 px-3 py-1 rounded-full text-sm font-medium flex items-center gap-1.5 hover:bg-zinc-700"
              >
                <Trash size={20} />
                <ChevronDown size={14} />
              </button>
              {isDeleteMenuOpen && (
                 <div className="absolute left-0 mt-2 w-48 bg-zinc-800 border border-zinc-700 rounded-md shadow-lg z-50">
                    <button
                    onClick={handleClearFlows}
                    className="block w-full text-left px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-700"
                  >
                    Clear View
                  </button>
                   <button
                    onClick={handleDeleteSelectedFlows}
                    disabled={selectedFlowIds.size === 0}
                    className="block w-full text-left px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Delete Selected ({selectedFlowIds.size})
                  </button>
                   <button
                    onClick={handleDeleteAllFlows}
                    className="block w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-zinc-700"
                  >
                    Delete All
                  </button>
                 </div>
              )}
            </div>

            <button
                onClick={() => setIsSettingsModalOpen(true)}
                aria-label="Settings"
                className="bg-gray-100 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 text-gray-700 dark:text-zinc-200 px-3 py-1 rounded-full text-sm font-medium flex items-center gap-1.5 hover:bg-gray-200 dark:hover:bg-zinc-700"
              >
                <Settings size={20} />
              </button>

            {/* Bulk Download Button with Dropdown */}
            <div className="relative inline-block" ref={bulkDownloadRef}>
              <button
                onClick={(e) => { e.stopPropagation(); setIsBulkDownloadOpen(o => !o); }}
                disabled={selectedFlowIds.size === 0}
                className="bg-gray-100 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 text-gray-700 dark:text-zinc-200 px-3 py-1 rounded-full text-sm font-medium flex items-center gap-1.5 hover:bg-gray-200 dark:hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Download size={20} /> {selectedFlowIds.size}
              </button>
              {isBulkDownloadOpen && (
                <div className="absolute right-0 bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded shadow-lg z-50 min-w-[180px] top-full mt-2">
                  <a
                    href="#"
                    onClick={(e) => { e.preventDefault(); handleDownloadSelectedFlows('har'); setIsBulkDownloadOpen(false); }}
                    className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-zinc-400 hover:bg-gray-100 dark:hover:bg-zinc-700 hover:text-gray-900 dark:hover:text-zinc-200"
                  >
                    <HardDriveDownload size={20} /> Download HAR
                  </a>
                  <a
                    href="#"
                    onClick={(e) => { e.preventDefault(); handleDownloadSelectedFlows('json'); setIsBulkDownloadOpen(false); }}
                    className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-zinc-400 hover:bg-gray-100 dark:hover:bg-zinc-700 hover:text-gray-900 dark:hover:text-zinc-200"
                  >
                    <Braces size={20} /> Download Flows (JSON)
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-2">
          {activeFilterCount > 0 && (
            <button
              onClick={() => setIsFilterModalOpen(true)}
              className="bg-gray-100 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 text-gray-700 dark:text-zinc-200 px-3 py-1 rounded-full text-sm font-medium flex items-center gap-2 hover:bg-gray-200 dark:hover:bg-zinc-700"
            >
              {activeFilterCount} {activeFilterCount > 1 ? 'Filters' : 'Filter'}
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  clearFilters();
                }}
                className="bg-gray-200 dark:bg-zinc-700 rounded-full p-0.5 hover:bg-gray-300 dark:hover:bg-zinc-600"
              >
                <X size={12} />
              </div>
            </button>
          )}

          {/* Filter Input */}
          <div className="relative flex items-center">
            <div className="relative">
              <input
              id="filter-input" // Add id for focus check
              type="text"
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              placeholder="Filter flows..."
              className="bg-gray-100 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-l-full text-gray-700 dark:text-zinc-200 px-4 py-1.5 pl-10 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 w-72"
            />
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500 dark:text-zinc-500" />
          </div>
          <button
            onClick={() => setIsFilterModalOpen(true)}
            className="bg-gray-100 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 border-l-0 rounded-r-full text-gray-400 dark:text-zinc-400 px-3 py-1.5 hover:bg-gray-200 dark:hover:bg-zinc-700 hover:text-gray-700 dark:hover:text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
            data-testid="filter-button"
          >
            <Filter size={20} />
          </button>
        </div>
        </div>
      </header>

      <FilterModal
        isOpen={isFilterModalOpen}
        onClose={handleCloseFilterModal}
        uniqueClientIps={uniqueClientIps}
      />

      <SettingsModal
        isOpen={isSettingsModalOpen}
        onClose={handleCloseSettingsModal}
      />

      <NoteModal
        isOpen={isNoteModalOpen}
        initialNote={detailsFlow?.note || ''}
        onClose={() => setIsNoteModalOpen(false)}
        onSave={(newNote) => {
            const flowId = getFlowId(detailsFlow);
            if (flowId) {
                handleUpdateFlow(flowId, { note: newNote });
            }
            setIsNoteModalOpen(false);
        }}
      />


      {/* --- Main Content: Table + Details --- */}
      <div className="flex flex-col flex-grow min-h-0">
        <div className="flex-grow min-h-0 overflow-auto" ref={mainTableRef}>
          <FlowTable
            flows={filteredFlows}
            focusedFlowId={selectedFlowId}
            selectedFlowIds={selectedFlowIds}
            newFlowIds={flowState.newIds}
            onRowSelected={handleFlowSelection}
            onTogglePin={handleTogglePin}
            pinned={pinned}
            onTogglePinnedFilter={() => setPinned(pinned === true ? false : (pinned === false ? undefined : true))}
            onToggleRowSelection={flowId => {
              setSelectedFlowIds(prev => {
                const newSet = new Set(prev);
                if (newSet.has(flowId)) {
                  newSet.delete(flowId);
                } else {
                  newSet.add(flowId);
                }
                return newSet;
              });
            }}
          />
        </div>
        {/* DetailsPanel remains below, not pushed out */}
      </div>

      {isFlowsTruncated && (
        <footer className="p-2 text-center text-xs text-gray-500 dark:text-zinc-500 border-t border-gray-200 dark:border-zinc-700">
          Showing the last {flowState.all.length} flows. You can change this limit in the <button onClick={() => setIsSettingsModalOpen(true)} className="underline hover:text-orange-500">settings</button>.
        </footer>
      )}

      {/* --- Details Panel --- */}
      <Toast
        message={toast?.message || ''}
        isVisible={!!toast?.visible}
        onClose={hideToast}
      />
      <DetailsPanel
        flow={detailsFlow}
        summary={selectedFlowSummary}
        isMinimized={isPanelMinimized}
        onClose={handleClosePanel}
        panelHeight={detailsPanelHeight}
        setPanelHeight={setDetailsPanelHeight}
        downloadFlowContent={downloadFlowContent}
        onTogglePin={handleTogglePin}
        onDeleteFlow={handleDeleteFlow}
        onEditNote={() => setIsNoteModalOpen(true)}
      >
        {detailsFlow?.flow?.case === 'httpFlow' && (
          <HttpFlowDetails
            key={selectedFlowId}
            flow={detailsFlow}
            requestFormat={requestFormats.get(selectedFlowId!) || 'auto'}
            setRequestFormat={(format) => handleSetRequestFormat(selectedFlowId!, format)}
            responseFormat={responseFormats.get(selectedFlowId!) || 'auto'}
            setResponseFormat={(format) => handleSetResponseFormat(selectedFlowId!, format)}
            contentRef={contentRef}
            onEditNote={() => setIsNoteModalOpen(true)}
            onUpdateFlow={handleUpdateFlow}
            selectedTab={lastSelectedTabs[getFlowType(detailsFlow)] || 'summary'}
            onTabChange={(tab) => setLastSelectedTabs(prev => ({ ...prev, [getFlowType(detailsFlow)]: tab }))}
          />
        )}
        {detailsFlow?.flow?.case === 'dnsFlow' && (
          <DnsFlowDetails
            key={selectedFlowId}
            flow={detailsFlow}
            onEditNote={() => setIsNoteModalOpen(true)}
            onUpdateFlow={handleUpdateFlow}
            selectedTab={lastSelectedTabs[getFlowType(detailsFlow)] || 'summary'}
            onTabChange={(tab) => setLastSelectedTabs(prev => ({ ...prev, [getFlowType(detailsFlow)]: tab }))}
          />
        )}
        {detailsFlow?.flow?.case === 'tcpFlow' && (
            <TcpFlowDetails
              key={selectedFlowId}
              flow={detailsFlow}
              onEditNote={() => setIsNoteModalOpen(true)}
              onUpdateFlow={handleUpdateFlow}
              selectedTab={lastSelectedTabs[getFlowType(detailsFlow)] || 'summary'}
              onTabChange={(tab) => setLastSelectedTabs(prev => ({ ...prev, [getFlowType(detailsFlow)]: tab }))}
            />
        )}
        {detailsFlow?.flow?.case === 'udpFlow' && (
            <UdpFlowDetails
              key={selectedFlowId}
              flow={detailsFlow} onEditNote={() => setIsNoteModalOpen(true)}
              onUpdateFlow={handleUpdateFlow}
              selectedTab={lastSelectedTabs[getFlowType(detailsFlow)] || 'summary'}
              onTabChange={(tab) => setLastSelectedTabs(prev => ({ ...prev, [getFlowType(detailsFlow)]: tab }))}
            />
        )}
      </DetailsPanel>
    </div>
  );
};

export default App;
