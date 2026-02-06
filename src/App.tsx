import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Search, Pause, Play, Download, Braces, HardDriveDownload, Menu, Filter, X, Settings, Trash, ChevronDown } from 'lucide-react';
import { createConnectTransport } from "@connectrpc/connect-web";
import { createClient } from "@connectrpc/connect";
import { Service, Flow, FlowSchema } from "./gen/mitmflow/v1/mitmflow_pb"
import { toJson } from "@bufbuild/protobuf";
import { DnsFlowDetails } from './components/DnsFlowDetails';
import { HttpFlowDetails } from './components/HttpFlowDetails';
import { TcpFlowDetails } from './components/TcpFlowDetails';
import { UdpFlowDetails } from './components/UdpFlowDetails';
import { ContentFormat, getFlowId, getTimestamp, getFlowTimestampNs } from './utils';
import { DetailsPanel } from './components/DetailsPanel';
import FilterModal from './components/FilterModal';
import NoteModal from './components/NoteModal';
import SettingsModal from './components/SettingsModal';
import useFilterStore, { FlowType } from './store';
import useSettingsStore from './settingsStore';
import FlowTable from './components/FlowTable';
import { isFlowMatch, FilterConfig } from './filterUtils';
import { Toast } from './components/Toast';

const getHarContent = (content: Uint8Array | undefined, contentType: string | undefined) => {
  if (!content || content.length === 0) {
    return { size: 0, text: '', mimeType: contentType || 'application/octet-stream' };
  }
  contentType = contentType || 'application/octet-stream';
  const contentAsString = new TextDecoder().decode(content);

  // Check for common text-based content types
  if (contentType.includes('json') || contentType.includes('xml') || contentType.includes('text')) {
    return { size: content.length, text: contentAsString, mimeType : contentType };
  } else {
    // For other types (binary, image, etc.), base64 encode
    // Avoid spread operator to prevent stack overflow on large content
    let binary = '';
    for (let i = 0; i < content.length; i++) {
      binary += String.fromCharCode(content[i]);
    }
    return { size: content.length, text: btoa(binary), mimeType: contentType, encoding: 'base64' };
  }
};

// New function to generate HAR blob
const generateHarBlob = (flowsToExport: Flow[]): Blob => {
  // Find earliest timestamp across flows (prefer request.start, else flow.start)
  const earliestMs = flowsToExport.reduce((min, flow) => {
    if (!flow.flow || !flow.flow.case) return min;
    if (flow.flow.case === 'httpFlow') {
      const httpFlow = flow.flow.value;
      const reqStart = getTimestamp(httpFlow.request?.timestampStart);
      const flowStart = getTimestamp(httpFlow.timestampStart);
      const candidate = reqStart > 0 ? reqStart : flowStart;
      if (candidate > 0 && (min === 0 || candidate < min)) return candidate;
    }
    return min;
  }, 0);

  const pageId = 'page_0';
  const pages = earliestMs > 0 ? [{
    id: pageId,
    startedDateTime: new Date(earliestMs).toISOString(),
    title: 'mitmflow capture',
    pageTimings: {}
  }] : [];

  const har = {
    log: {
      version: "1.2",
      creator: { name: "mitm-flows", version: "1.0" },
      pages,
      entries: flowsToExport.flatMap(flow => {
        if (flow?.flow?.case === 'httpFlow') {
          const httpFlow = flow.flow.value;
          // Convert query string to array of {name, value}
          let queryString: { name: string; value: string }[] = [];
          if (httpFlow.request?.url) {
            try {
              const urlObj = new URL(httpFlow.request.url);
              queryString = Array.from(urlObj.searchParams.entries()).map(([name, value]) => ({ name, value }));
            } catch {
              // fallback: empty array
            }
          }

          // HAR timings: derive from request/response timestamps if available
          const reqStartMs = getTimestamp(httpFlow.request?.timestampStart);
          const reqEndMs = getTimestamp(httpFlow.request?.timestampEnd);
          const resStartMs = getTimestamp(httpFlow.response?.timestampStart);
          const resEndMs = getTimestamp(httpFlow.response?.timestampEnd);

          const send = reqStartMs > 0 && reqEndMs > 0 && reqEndMs >= reqStartMs ? reqEndMs - reqStartMs : 0;
          const wait = reqEndMs > 0 && resStartMs > 0 && resStartMs >= reqEndMs ? resStartMs - reqEndMs : 0;
          const receive = resStartMs > 0 && resEndMs > 0 && resEndMs >= resStartMs ? resEndMs - resStartMs : 0;
          const timings = { send, wait, receive };
          const time = send + wait + receive;

          // Only include postData for methods that can have a body
          let postData: ReturnType<typeof getHarContent> | undefined = undefined;
          const method = httpFlow.request?.method || '';
          if (["POST", "PUT", "PATCH", "DELETE"].includes(method.toUpperCase()) && httpFlow.request?.content && httpFlow.request.content.length > 0) {
            postData = getHarContent(httpFlow.request?.content, flow.httpFlowExtra?.request?.effectiveContentType);
          }

          const startTime = reqStartMs > 0 ? reqStartMs : getTimestamp(httpFlow.timestampStart);
          const startedDateTime = startTime > 0 ? new Date(startTime).toISOString() : new Date().toISOString();

          return [{
            pageref: pages.length ? pageId : undefined,
            connection: httpFlow.server?.addressPort ? String(httpFlow.server.addressPort) : '',
            startedDateTime,
            time,
            timings,
            cache: {},
            request: {
              method,
              url: httpFlow.request?.prettyUrl || httpFlow.request?.url || '',
              httpVersion: httpFlow.request?.httpVersion || 'HTTP/1.1',
              headers: httpFlow.request?.headers ? Object.entries(httpFlow.request.headers).map(([name, value]) => ({ name, value })) : [],
              queryString,
              cookies: [],
              ...(postData ? { postData } : {}),
              headersSize: -1,
              bodySize: httpFlow.request?.content ? httpFlow.request.content.length : 0,
            },
            response: {
              status: httpFlow.response?.statusCode || 0,
              statusText: httpFlow.response?.reason || 'OK',
              httpVersion: httpFlow.response?.httpVersion || 'HTTP/1.1',
              headers: httpFlow.response?.headers ? Object.entries(httpFlow.response.headers).map(([name, value]) => ({ name, value })) : [],
              cookies: [],
              content: getHarContent(httpFlow.response?.content, flow.httpFlowExtra?.response?.effectiveContentType),
              headersSize: -1,
              bodySize: httpFlow.response?.content ? httpFlow.response.content.length : 0,
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
  const [flowState, setFlowState] = useState<{ all: Flow[]; filtered: Flow[] }>({ all: [], filtered: [] });
  const [isFlowsTruncated, setIsFlowsTruncated] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('connecting');
  const [retryCount, setRetryCount] = useState(0);
  const latestTimestampNs = useRef<bigint>(BigInt(0));
  const {
    text: filterText,
    setText: setFilterText,
    pinnedOnly,
    setPinnedOnly,
    hasNote,
    setHasNote,
    flowTypes,
    setFlowTypes,
    http,
    setHttpMethods,
    setHttpContentTypes,
    setHttpStatusCodes,
    clearFilters
  } = useFilterStore();

  // Load from URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    if (params.has('q')) {
      setFilterText(params.get('q') || '');
    }
    if (params.has('pinned')) {
      setPinnedOnly(params.get('pinned') === 'true');
    }
    if (params.has('hasNote')) {
      setHasNote(params.get('hasNote') === 'true');
    }
    if (params.has('type')) {
      const types = params.get('type')?.split(',') as FlowType[];
      setFlowTypes(types || []);
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
    if (pinnedOnly) params.set('pinned', 'true');
    if (hasNote) params.set('hasNote', 'true');
    if (flowTypes.length > 0) params.set('type', flowTypes.join(','));
    if (http.methods.length > 0) params.set('method', http.methods.join(','));
    if (http.statusCodes.length > 0) params.set('status', http.statusCodes.join(','));
    if (http.contentTypes.length > 0) params.set('content', http.contentTypes.join(','));

    const newUrl = params.toString() ? `?${params.toString()}` : window.location.pathname;
    window.history.replaceState(null, '', newUrl);
  }, [filterText, pinnedOnly, hasNote, flowTypes, http]);

  const filterRef = useRef<FilterConfig>({ text: filterText, pinnedOnly, hasNote, flowTypes, http });

  useEffect(() => {
    filterRef.current = { text: filterText, pinnedOnly, hasNote, flowTypes, http };
  }, [filterText, pinnedOnly, hasNote, flowTypes, http]);

  // Re-filter when filter settings change
  useEffect(() => {
    setFlowState(prev => ({
      all: prev.all,
      filtered: prev.all.filter(f => isFlowMatch(f, filterRef.current))
    }));
  }, [filterText, pinnedOnly, hasNote, flowTypes, http]);
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
  const [detailsPanelHeight, setDetailsPanelHeight] = useState<number | null>(null);
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

  // Settings from store
  const { theme, maxFlows: storedMaxFlows, maxBodySize } = useSettingsStore();
  // Ensure maxFlows is a valid number, defaulting to 500 if undefined or invalid (e.g. NaN from old local storage)
  const maxFlows = Number.isFinite(storedMaxFlows) ? storedMaxFlows : 500;

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

  const downloadFlowContent = useCallback((flow: Flow, type: 'har' | 'flow-json' | 'request' | 'response') => {
    const httpFlow = flow.flow.case === 'httpFlow' ? flow.flow.value : null;

    let blob: Blob;
    let filename: string;

    if (type === 'flow-json') {
      blob = new Blob([JSON.stringify(toJson(FlowSchema, flow), null, 2)], { type: 'application/json;charset=utf-8' });
      filename = `${getFlowId(flow)}.json`;
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
        case 'har':
          blob = generateHarBlob([flow]);
          filename = `${httpFlow.id}.har`;
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

  // --- Data Fetching ---
  useEffect(() => {
    if (isPaused) {
      setConnectionStatus('paused');
      return;
    }

    let abortController = new AbortController();
    let timeoutId: NodeJS.Timeout;
    let stabilityTimer: NodeJS.Timeout;

    // We use a ref to track if we have "spent" our one-time instant retry.
    // This persists across the recursive calls without being reset by closures.
    // Default is false (we haven't used it yet).
    const retryState = { used: false };

    const attemptConnection = async () => {
      abortController = new AbortController();
      const signal = abortController.signal;

      // 1. Determine Status based on if we are using our "Free Retry"
      if (retryState.used) {
        setConnectionStatus('reconnecting');
      } else {
        setConnectionStatus('connecting');
      }

      try {
        const streamPromise = client.streamFlows({ sinceTimestampNs: latestTimestampNs.current }, { signal });
        
        // 2. UX DELAY: If we are "Reconnecting" (Yellow), force a 1s wait.
        // This prevents the UI from flickering Yellow->Red too fast if the server is truly down,
        // giving the user a moment to realize "Oh, it's trying to reconnect".
        const delayPromise = retryState.used 
          ? new Promise(resolve => setTimeout(resolve, 1000)) 
          : Promise.resolve();

        const [response] = await Promise.all([streamPromise, delayPromise]);
        const stream = response;

        // 3. SUCCESS STATE
        setConnectionStatus('live');
        setRetryCount(0);

        // 4. STABILITY LOGIC: If we stay connected for 5 seconds, we "refund" the retry token.
        // This allows us to handle a load balancer timeout every hour, not just once per page load.
        clearTimeout(stabilityTimer);
        stabilityTimer = setTimeout(() => {
            retryState.used = false; // Reset! We can retry instantly again if needed.
        }, 5000);

        for await (const response of stream) {
          if (!response.flow || !response.flow.flow) continue;
          
          // ... (Your existing setFlowState logic remains exactly the same) ...
           setFlowState(prevState => {
             if (!response.flow) return prevState;
            const incomingFlow = response.flow;
            const flowTs = getFlowTimestampNs(incomingFlow);
            if (flowTs > latestTimestampNs.current) {
              latestTimestampNs.current = flowTs;
            }

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

            const incomingFlowId = getFlowId(incomingFlow);
            const existingIndex = prevState.all.findIndex(r => {
              const rFlowId = getFlowId(r);
              return rFlowId && incomingFlowId && rFlowId === incomingFlowId;
            });

            let newAll = [...prevState.all];
            let newFiltered = [...prevState.filtered];

            if (existingIndex !== -1) {
              newAll[existingIndex] = incomingFlow;
              const filteredIndex = newFiltered.findIndex(r => getFlowId(r) === incomingFlowId);
              const matches = isFlowMatch(incomingFlow, filterRef.current);

              if (filteredIndex !== -1) {
                if (matches) {
                  newFiltered[filteredIndex] = incomingFlow;
                } else {
                  newFiltered.splice(filteredIndex, 1);
                }
              } else if (matches) {
                newFiltered = [incomingFlow, ...newFiltered];
              }
            } else {
              newAll = [incomingFlow, ...newAll];

              if (isFlowMatch(incomingFlow, filterRef.current)) {
                newFiltered = [incomingFlow, ...newFiltered];
              }

              if (newAll.length > maxFlows) {
                // Batch prune all excess flows
                const excessCount = newAll.length - maxFlows;
                const droppedFlows = newAll.splice(newAll.length - excessCount, excessCount);
                setIsFlowsTruncated(true);

                // Collect IDs of dropped flows
                const droppedIds = new Set(droppedFlows.map(f => getFlowId(f)).filter((id): id is string => !!id));

                // Remove dropped flows from filtered list
                newFiltered = newFiltered.filter(f => !droppedIds.has(getFlowId(f)!));

                // Update selected flows if any dropped flow was selected
                // Note: We use functional update unconditionally because 'selectedFlowIds' in this closure might be stale
                if (droppedIds.size > 0) {
                    setSelectedFlowIds(prev => {
                        let hasChanges = false;
                        const newSet = new Set(prev);
                        for (const id of droppedIds) {
                            if (newSet.has(id)) {
                                newSet.delete(id);
                                hasChanges = true;
                            }
                        }
                        return hasChanges ? newSet : prev;
                    });
                }
              }
            }
            return { all: newAll, filtered: newFiltered };
          });
        }
        
        // Stream finished normally
        if (!isPaused) {
          timeoutId = setTimeout(attemptConnection, 2000);
        }

      } catch (err) {
        if (signal.aborted) return;
        console.error("Connection stream error:", err);

        // 5. FAILURE LOGIC
        // If we haven't used our retry token yet, use it now!
        if (!retryState.used) {
            console.log("Attempting silent immediate retry...");
            retryState.used = true; // Mark as used
            
            // Retry immediately (recursive call)
            attemptConnection(); 
        } else {
            // We already tried to recover instantly and failed again.
            // Now we must show the error state.
            setConnectionStatus('failed');
            const delay = Math.min(30000, 2000 * (2 ** retryCount));
            setRetryCount(prev => prev + 1);
            if (!isPaused) {
                timeoutId = setTimeout(attemptConnection, delay);
            }
        }
      }
    };

    attemptConnection();

    return () => {
      clearTimeout(timeoutId);
      clearTimeout(stabilityTimer); // Clean up the stability timer
      abortController.abort();
    };
  }, [isPaused, maxFlows, maxBodySize]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
      if (deleteMenuRef.current && !deleteMenuRef.current.contains(event.target as Node)) {
        setIsDeleteMenuOpen(false);
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


  const activeFilterCount =
    (pinnedOnly ? 1 : 0) +
    (hasNote ? 1 : 0) +
    (flowTypes.length > 0 ? 1 : 0) +
    (http.methods.length > 0 ? 1 : 0) +
    (http.contentTypes.length > 0 ? 1 : 0) +
    (http.statusCodes.length > 0 ? 1 : 0);

  // --- Derived State (Filtering) ---
  const filteredFlows = flowState.filtered;

  const detailsFlow = useMemo(() =>
    selectedFlowId ? flowState.all.find(f => getFlowId(f) === selectedFlowId) || null : null
  , [flowState.all, selectedFlowId]);

  const getFlowType = (flow: Flow | null): string => {
    if (!flow?.flow?.case) return 'unknown';
    if (flow.flow.case === 'httpFlow' && flow.flow.value.isWebsocket) {
      return 'websocket';
    }
    return flow.flow.case;
  }

  // --- Event Handlers ---
  const handleDownloadSelectedFlows = (format: 'har' | 'json') => {
    const selectedFlows = flowState.all.filter(flow => {
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
    setFlowState({ all: [], filtered: [] }); // Clear the main flows array
    setIsFlowsTruncated(false);
    setSelectedFlowId(null);
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
        all: prev.all.filter(f => !ids.includes(getFlowId(f) || '')),
        filtered: prev.filtered.filter(f => !ids.includes(getFlowId(f) || ''))
      }));
      setSelectedFlowId(null);
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
          filtered: pinnedFlows.filter(f => isFlowMatch(f, filterRef.current))
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

  const handleDeleteFlow = useCallback(async (flow: Flow) => {
    const flowId = getFlowId(flow);
    if (!flowId) return;
    try {
      await client.deleteFlows({ flowIds: [flowId] });
      setFlowState(prev => ({
        all: prev.all.filter(f => getFlowId(f) !== flowId),
        filtered: prev.filtered.filter(f => getFlowId(f) !== flowId)
      }));
      if (selectedFlowId === flowId) {
        setSelectedFlowId(null);
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
      await client.updateFlow({ flowId, ...updates });

      if (updates.pinned === true) {
        showToast("Flow pinned. It will not be deleted automatically.");
      }
    } catch (err) {
      console.error("Failed to update flow", err);
    }
  }, [client, showToast]);

  const handleTogglePin = useCallback(async (flow: Flow) => {
    const flowId = getFlowId(flow);
    if (!flowId) return;
    handleUpdateFlow(flowId, { pinned: !flow.pinned });
  }, [handleUpdateFlow]);

  const handleFlowSelection = useCallback((flow: Flow) => {
    const currentFlowId = getFlowId(flow);
    if (!currentFlowId) {
      return;
    }

    // Update focused and displayed flow
    setSelectedFlowId(currentFlowId);
    lastSelectedFlowId.current = currentFlowId;
    setIsPanelMinimized(false);
  }, []);

  const handleClosePanel = useCallback(() => {
    setSelectedFlowId(null);
    setDetailsPanelHeight(null); // Reset height when panel is closed
  }, []); // Memoize with useCallback





  return (
    <div className="bg-white dark:bg-zinc-900 text-gray-900 dark:text-zinc-300 font-sans h-screen flex flex-col">
      {/* --- Header --- */}
      <header className="p-4 border-b border-gray-200 dark:border-zinc-700 flex items-center gap-4 flex-shrink-0 bg-white dark:bg-zinc-900">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Flows</h1>
        <div className="flex items-center gap-2 ml-2">
          {/* Connection Status Indicator */}
          <div className={`flex items-center justify-center w-32 gap-2 px-3 py-1 rounded-full text-sm font-medium
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
            onRowSelected={handleFlowSelection}
            onTogglePin={handleTogglePin}
            pinnedOnly={pinnedOnly}
            onTogglePinnedFilter={() => setPinnedOnly(!pinnedOnly)}
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
