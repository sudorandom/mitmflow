import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  Search, Pause, Play, X, ChevronDown, ChevronRight, Minus, Download, FileText, Braces, HardDriveDownload
} from 'lucide-react';

// --- TYPE DEFINITIONS ---

type LogLevel = 'INFO' | 'WARN' | 'ERRO' | 'DEBUG';

interface LogEntry {
  id: string;
  level: LogLevel;
  message: string;
  timestamp: number;
}

type Protocol = 'HTTP' | 'HTTPS';

interface Flow {
  id: string;
  protocol: Protocol;
  method: string;
  status: number;
  source: string; // We'll keep it in the data model, just not display it
  destination: string;
  path: string;
  url: string;
  size: string;
  duration: string;
  requestTs: number;
  _latency: string;
  _request: string;
  _response: string;
  _requestBody: string;
  _responseBody: string;
}

type DetailView = { type: 'flow'; data: Flow } | { type: 'log'; data: LogEntry } | null;

// --- SIMULATION HELPERS ---

const randomChoice = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
const randomInt = (min: number, max: number): number => Math.floor(Math.random() * (max - min + 1)) + min;

const formatTimestamp = (ts: number): string => {
  const date = new Date(ts);
  return date.toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }) + '.' + date.getMilliseconds().toString().padStart(3, '0');
};

const methods = ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'];
const protocols: Protocol[] = ['HTTP', 'HTTPS'];
const domains = ['example.com', 'api.google.com', 'assets.cdn.net', 'tracking.service.org', 'auth.provider.io', 'my-app-backend.local'];
const paths = ['/api/v2/users', '/login', '/main.js', '/pixel.gif', '/', '/config.json', '/items/123', '/search?q=test'];
const statuses = [200, 201, 204, 301, 302, 304, 400, 401, 403, 404, 500, 502, 503];
const contentTypes = ['application/json', 'text/html', 'image/png', 'text/css', 'application/javascript'];
const userAgents = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36',
  'curl/7.81.0',
  'MyAwesomeApp/1.2.3 (iOS; 16.1; iPhone14,5)'
];

const createRandomFlow = (): Flow => {
  const method = randomChoice(methods);
  const protocol = randomChoice(protocols);
  const status = randomChoice(statuses);
  const domain = randomChoice(domains);
  const path = randomChoice(paths);
  const sourceIp = `192.168.1.${randomInt(100, 200)}`;
  const url = `${protocol.toLowerCase()}://${domain}${path}`;
  const size = randomInt(50, 5000);
  const duration = randomInt(20, 1500);
  const requestTs = Date.now();

  const requestBody = (method === 'POST' || method === 'PUT') ? `{"id": ${randomInt(1, 1000)}, "value": "some_data_${Math.random().toString(36).substring(7)}"}` : '';
  const responseBody = (status === 200 && method === 'GET') ? `{"data": "some_json_payload_${randomInt(100, 999)}"}` : `[${status} Response Body]`;

  return {
    id: `flow_${requestTs}_${Math.random()}`,
    protocol,
    method,
    status,
    source: sourceIp,
    destination: domain,
    path: path,
    url: url,
    size: size > 1024 ? `${(size / 1024).toFixed(1)} KB` : `${size} B`,
    duration: `${duration} ms`,
    requestTs: requestTs,
    _latency: `${duration} ms`,
    _request: `${method} ${path} HTTP/1.1\nHost: ${domain}\nUser-Agent: ${randomChoice(userAgents)}\nAccept: */*\n\n${requestBody}`,
    _response: `HTTP/1.1 ${status}\nContent-Type: ${randomChoice(contentTypes)}\nContent-Length: ${size}\n\n${responseBody}`,
    _requestBody: requestBody,
    _responseBody: responseBody
  };
};

const createRandomLog = (): Omit<LogEntry, 'id' | 'timestamp'> => {
  const rand = Math.random();
  if (rand < 0.1) {
    return { level: 'DEBUG', message: `Client connected from 192.168.1.${randomInt(100, 200)}` };
  } else {
    return { level: 'WARN', message: `SSL Handshake error for ${randomChoice(domains)}` };
  }
};

// --- HELPER COMPONENTS ---

/**
 * Renders a single flow row in the table
 */
const FlowRow: React.FC<{ flow: Flow; isSelected: boolean; onClick: () => void }> = ({ flow, isSelected, onClick }) => {
  const statusClass = useMemo(() => {
    if (flow.status >= 500) return 'text-red-500 font-bold';
    if (flow.status >= 400) return 'text-red-400';
    if (flow.status >= 300) return 'text-yellow-400';
    return 'text-green-400';
  }, [flow.status]);

  return (
    <tr
      className={`border-b border-zinc-800 cursor-pointer ${isSelected ? 'bg-orange-900/30 hover:bg-orange-900/40' : 'hover:bg-zinc-800/50'}`}
      onClick={onClick}
      data-flow-id={flow.id} // Add data-attribute for scrolling
    >
      <td className="p-3 font-mono max-w-xs overflow-hidden text-ellipsis whitespace-nowrap">{flow.protocol}</td>
      <td className="p-3 font-mono max-w-xs overflow-hidden text-ellipsis whitespace-nowrap">{flow.method}</td>
      <td className={`p-3 font-mono max-w-xs overflow-hidden text-ellipsis whitespace-nowrap ${statusClass}`}>{flow.status}</td>
      <td className="p-3 font-mono max-w-xs overflow-hidden text-ellipsis whitespace-nowrap" title={flow.destination}>{flow.destination}</td>
      <td className="p-3 font-mono max-w-xs overflow-hidden text-ellipsis whitespace-nowrap" title={flow.path}>{flow.path}</td>
      <td className="p-3 font-mono max-w-xs overflow-hidden text-ellipsis whitespace-nowrap">{flow.size}</td>
      <td className="p-3 font-mono max-w-xs overflow-hidden text-ellipsis whitespace-nowrap">{flow.duration}</td>
    </tr>
  );
};

/**
 * Renders the slide-up details panel
 */
const DetailsPanel: React.FC<{
  detailView: DetailView;
  isMinimized: boolean;
  onClose: () => void;
  onMinimize: () => void;
}> = ({ detailView, isMinimized, onClose, onMinimize }) => {
  const [isDownloadOpen, setDownloadOpen] = useState(false);
  const downloadRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  // Close download menu on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (downloadRef.current && !downloadRef.current.contains(event.target as Node)) {
        setDownloadOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleDownload = (type: 'har' | 'request' | 'response') => {
    if (detailView?.type !== 'flow') return;
    const { data: flow } = detailView;

    let blob: Blob;
    let filename: string;

    if (type === 'request') {
      blob = new Blob([flow._requestBody || flow._request], { type: 'text/plain;charset=utf-8' });
      filename = 'request.txt';
    } else if (type === 'response') {
      blob = new Blob([flow._responseBody || flow._response], { type: 'text/plain;charset=utf-8' });
      filename = 'response.txt';
    } else {
      // Simplified HAR generation
      const har = {
        log: {
          version: "1.2",
          creator: { name: "mitm-prototype-react", version: "1.0" },
          entries: [{
            startedDateTime: new Date(flow.requestTs).toISOString(),
            time: parseInt(flow._latency),
            request: {
              method: flow.method,
              url: flow.url,
              httpVersion: "HTTP/1.1", headers: [], queryString: [], cookies: [],
              postData: { mimeType: "application/json", text: flow._requestBody }
            },
            response: {
              status: flow.status, statusText: "OK", httpVersion: "HTTP/1.1", headers: [], cookies: [],
              content: { text: flow._responseBody, mimeType: "application/json" }
            }
          }]
        }
      };
      blob = new Blob([JSON.stringify(har, null, 2)], { type: 'application/json;charset=utf-8' });
      filename = 'flow.har';
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setDownloadOpen(false);
  };

  const panelClasses = [
    'fixed bottom-0 left-0 w-full bg-zinc-900 border-t border-orange-500 shadow-2xl z-50 transition-transform duration-300 ease-in-out flex flex-col max-h-[50vh]',
    detailView ? 'translate-y-0' : 'translate-y-full',
    isMinimized ? 'translate-y-[calc(100%-39px)]' : '',
  ].join(' ');

  const isDropdownDown = contentRef.current && contentRef.current.offsetHeight > 200;

  return (
    <div className={panelClasses}>
      {/* Panel Header */}
      <div
        className="flex items-center p-2.5 px-4 bg-zinc-800 border-b border-zinc-700 cursor-pointer flex-shrink-0"
        onClick={onMinimize}
      >
        <h4 className="font-semibold font-mono text-sm text-ellipsis overflow-hidden whitespace-nowrap">
          {detailView?.type === 'flow' ? `Flow: ${detailView.data.url}` : 'Log Details'}
        </h4>
        <div className="ml-auto flex items-center">
          <button
            onClick={(e) => { e.stopPropagation(); onMinimize(); }}
            className="p-1 text-zinc-500 hover:text-zinc-200"
            title="Minimize"
          >
            <Minus size={18} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onClose(); }}
            className="p-1 text-zinc-500 hover:text-zinc-200"
            title="Close"
          >
            <X size={20} />
          </button>
        </div>
      </div>

      {/* Panel Content */}
      <div className="p-5 overflow-y-auto flex-grow" ref={contentRef}>
        {detailView?.type === 'flow' && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 font-mono text-sm mb-4">
              <div className="bg-zinc-800 p-2.5 rounded">
                <strong className="text-zinc-500 mr-2">Time:</strong> {formatTimestamp(detailView.data.requestTs)}
              </div>
              <div className="bg-zinc-800 p-2.5 rounded">
                <strong className="text-zinc-500 mr-2">Latency:</strong> {detailView.data._latency}
              </div>
            </div>
            
            <div className="border-b border-zinc-700 pb-4 mb-4">
              <div className="relative inline-block" ref={downloadRef}>
                <button
                  onClick={() => setDownloadOpen(o => !o)}
                  className="flex items-center gap-2 bg-zinc-700 px-4 py-2 rounded text-sm font-medium hover:bg-zinc-600"
                >
                  <Download size={16} />
                  Download
                  <ChevronDown size={16} className={`transition-transform ${isDownloadOpen ? 'rotate-180' : ''}`} />
                </button>
                {isDownloadOpen && (
                  <div className={`absolute left-0 bg-zinc-800 border border-zinc-700 rounded shadow-lg z-10 min-w-[180px] ${isDropdownDown ? 'top-full mt-1' : 'bottom-full mb-1'}`}>
                    <a
                      href="#"
                      onClick={(e) => { e.preventDefault(); handleDownload('har'); }}
                      className="flex items-center gap-3 px-4 py-2.5 text-sm text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200"
                    >
                      <HardDriveDownload size={16} /> Download HAR
                    </a>
                    <a
                      href="#"
                      onClick={(e) => { e.preventDefault(); handleDownload('request'); }}
                      className="flex items-center gap-3 px-4 py-2.5 text-sm text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200"
                    >
                      <FileText size={16} /> Download Request
                    </a>
                    <a
                      href="#"
                      onClick={(e) => { e.preventDefault(); handleDownload('response'); }}
                      className="flex items-center gap-3 px-4 py-2.5 text-sm text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200"
                    >
                      <Braces size={16} /> Download Response
                    </a>
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <h3 className="text-lg font-semibold mb-2 pb-2 border-b border-zinc-700">Request</h3>
                <pre className="bg-zinc-800 p-3 rounded text-xs font-mono whitespace-pre-wrap break-all max-h-48 overflow-y-auto">
                  {detailView.data._request}
                </pre>
              </div>
              <div>
                <h3 className="text-lg font-semibold mb-2 pb-2 border-b border-zinc-700">Response</h3>
                <pre className="bg-zinc-800 p-3 rounded text-xs font-mono whitespace-pre-wrap break-all max-h-48 overflow-y-auto">
                  {detailView.data._response}
                </pre>
              </div>
            </div>
          </>
        )}
        {detailView?.type === 'log' && (
          <div className="font-mono text-sm whitespace-pre-wrap break-all">
            {detailView.data.message}
          </div>
        )}
      </div>
    </div>
  );
};

// --- MAIN APP COMPONENT ---

const App: React.FC = () => {
  // --- State ---
  const [flows, setFlows] = useState<Flow[]>([]);
  const [logEntries, setLogEntries] = useState<LogEntry[]>([
    { id: 'log_0', level: 'INFO', message: 'Proxy started at http://*:8080', timestamp: Date.now() }
  ]);
  const [isPaused, setIsPaused] = useState(false);
  const [filterText, setFilterText] = useState('');
  const [isLogExpanded, setIsLogExpanded] = useState(false);
  const [detailView, setDetailView] = useState<DetailView>(null);
  const [isPanelMinimized, setIsPanelMinimized] = useState(false);
  const [selectedFlowId, setSelectedFlowId] = useState<string | null>(null);
  
  const logContentRef = useRef<HTMLDivElement>(null);
  const mainTableRef = useRef<HTMLDivElement>(null); // Ref for the main table scrolling area

  // --- Simulation Effects ---
  useEffect(() => {
    let flowInterval: ReturnType<typeof setInterval>;
    let logInterval: ReturnType<typeof setInterval>;

    if (!isPaused) {
      // Add new flows
      flowInterval = setInterval(() => {
        setFlows(prevFlows => [createRandomFlow(), ...prevFlows.slice(0, 99)]);
      }, randomInt(800, 2000));

      // Add random log events
      logInterval = setInterval(() => {
        const rand = Math.random();
        if (rand > 0.15) return; // Only add logs 15% of the time
        
        const newLog = createRandomLog();
        setLogEntries(prevLogs => [
          ...prevLogs,
          { ...newLog, id: `log_${Date.now()}`, timestamp: Date.now() }
        ]);
      }, 3000);
    }

    // Cleanup
    return () => {
      clearInterval(flowInterval);
      clearInterval(logInterval);
    };
  }, [isPaused]); // Dependency: re-run when pause state changes

  // --- Auto-scroll log ---
  useEffect(() => {
    if (logContentRef.current) {
      logContentRef.current.scrollTop = logContentRef.current.scrollHeight;
    }
  }, [logEntries]); // Dependency: run when new log entries are added

  // --- Derived State (Filtering) ---
  const filteredFlows = useMemo(() => {
    const filter = filterText.toLowerCase();
    if (!filter) return flows;
    
    return flows.filter(flow => {
      // Removed flow.source from the filter string
      const filterText = `${flow.protocol} ${flow.method} ${flow.status} ${flow.destination} ${flow.path}`.toLowerCase();
      return filterText.includes(filter);
    });
  }, [flows, filterText]); // Dependencies: re-run when flows or filter text change

  // --- Event Handlers ---
  const togglePause = () => setIsPaused(prev => !prev);
  
  const handleClearFlows = () => {
    setFlows([]);
    setDetailView(null);
    setSelectedFlowId(null);
  };

  const handleFlowClick = useCallback((flow: Flow) => {
    setDetailView({ type: 'flow', data: flow });
    setSelectedFlowId(flow.id);
    setIsPanelMinimized(false);
  }, []); // Memoize with useCallback

  const handleLogClick = (log: LogEntry) => {
    setDetailView({ type: 'log', data: log });
    setSelectedFlowId(null); // Deselect flow
    setIsPanelMinimized(false);
  };
  
  const handleClosePanel = useCallback(() => {
    setDetailView(null);
    setSelectedFlowId(null);
  }, []); // Memoize with useCallback

  const handleMinimizePanel = useCallback(() => {
    setIsPanelMinimized(prev => !prev);
  }, []); // Memoize with useCallback

  // --- Keyboard Navigation Effect ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't navigate if user is typing in the filter input
      if (e.target === document.getElementById('filter-input')) {
        return;
      }

      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') {
        return;
      }
      
      e.preventDefault(); // Prevent page scrolling

      if (filteredFlows.length === 0) {
        return;
      }

      let currentIndex = -1;
      if (selectedFlowId) {
        currentIndex = filteredFlows.findIndex(f => f.id === selectedFlowId);
      }

      let nextIndex = -1;
      if (e.key === 'ArrowDown') {
        nextIndex = Math.min(currentIndex + 1, filteredFlows.length - 1);
        if (currentIndex === -1) nextIndex = 0; // Start from top if nothing is selected
      } else { // ArrowUp
        nextIndex = Math.max(currentIndex - 1, 0);
        if (currentIndex === -1) nextIndex = 0; // Start from top if nothing is selected
      }
      
      if (nextIndex !== currentIndex && nextIndex > -1) {
        const nextFlow = filteredFlows[nextIndex];
        if (nextFlow) {
          // This will update selection and open/update the details panel
          handleFlowClick(nextFlow);
          
          // Scroll the item into view
          const rowElement = mainTableRef.current?.querySelector(`[data-flow-id="${nextFlow.id}"]`);
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
  }, [filteredFlows, selectedFlowId, handleFlowClick]); // Add dependencies

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

  const getLogLevelClass = (level: LogLevel) => {
    switch (level) {
      case 'WARN': return 'text-yellow-400';
      case 'ERRO': return 'text-red-400';
      case 'DEBUG': return 'text-zinc-500';
      default: return 'text-zinc-300';
    }
  };

  return (
    <div className="bg-zinc-900 text-zinc-300 font-sans h-screen overflow-hidden flex flex-col">
      {/* --- Header --- */}
      <header className="p-4 border-b border-zinc-700 flex items-center gap-4 flex-shrink-0">
        <h1 className="text-2xl font-semibold text-white">Web Flows</h1>
        
        <div className="flex items-center gap-2 ml-2">
          {/* Live Indicator */}
          <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-sm font-medium ${isPaused 
            ? 'text-yellow-400 bg-yellow-900/50' 
            : 'text-green-400 bg-green-900/50'}`}
          >
            <span className={`w-2 h-2 rounded-full ${isPaused ? 'bg-yellow-400' : 'bg-green-400 animate-pulse'}`} />
            {isPaused ? 'Paused' : 'Live'}
          </div>
          
          {/* Pause Button */}
          <button
            onClick={togglePause}
            className="bg-zinc-800 border border-zinc-700 text-zinc-200 px-3 py-1 rounded-full text-sm font-medium flex items-center gap-1.5 hover:bg-zinc-700"
          >
            {isPaused ? <Play size={14} /> : <Pause size={14} />}
            {isPaused ? 'Resume' : 'Pause'}
          </button>
          
          {/* Clear Button */}
          <button
            onClick={handleClearFlows}
            className="bg-zinc-800 border border-zinc-700 text-zinc-200 px-3 py-1 rounded-full text-sm font-medium flex items-center gap-1.5 hover:bg-zinc-700"
          >
            Clear Flows
          </button>
        </div>
        
        {/* Filter Input */}
        <div className="ml-auto relative">
          <input
            id="filter-input" // Add id for focus check
            type="text"
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            placeholder="Filter flows..."
            className="bg-zinc-800 border border-zinc-700 rounded-full text-zinc-200 px-4 py-1.5 pl-10 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 w-72"
          />
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" />
        </div>
      </header>

      {/* --- Flow Table --- */}
      <main className="flex-grow overflow-y-auto" ref={mainTableRef}> {/* Add ref */}
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 bg-zinc-800 z-10">
            <tr>
              <th className="p-3 text-left font-medium text-zinc-500 border-b-2 border-zinc-700 w-[5%]">Proto</th>
              <th className="p-3 text-left font-medium text-zinc-500 border-b-2 border-zinc-700 w-[5%]">Method</th>
              <th className="p-3 text-left font-medium text-zinc-500 border-b-2 border-zinc-700 w-[5%]">Status</th>
              <th className="p-3 text-left font-medium text-zinc-500 border-b-2 border-zinc-700 w-[30%]">Destination</th>
              <th className="p-3 text-left font-medium text-zinc-500 border-b-2 border-zinc-700 w-[40%]">Path</th>
              <th className="p-3 text-left font-medium text-zinc-500 border-b-2 border-zinc-700 w-[8%]">Size</th>
              <th className="p-3 text-left font-medium text-zinc-500 border-b-2 border-zinc-700 w-[7%]">Duration</th>
            </tr>
          </thead>
          <tbody>
            {filteredFlows.map(flow => (
              <FlowRow
                key={flow.id}
                flow={flow}
                isSelected={flow.id === selectedFlowId}
                onClick={() => handleFlowClick(flow)}
              />
            ))}
          </tbody>
        </table>
      </main>

      {/* --- Event Log --- */}
      <footer className="flex-shrink-0 border-t border-zinc-700 bg-zinc-800 flex flex-col">
        <div
          className="p-2.5 px-4 text-sm font-medium border-b border-zinc-700 bg-zinc-800 cursor-pointer flex items-center"
          onClick={() => setIsLogExpanded(prev => !prev)}
        >
          {isLogExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          <h3 className="ml-2">Event Log</h3>
        </div>
        {isLogExpanded && (
          <div
            ref={logContentRef}
            className="h-48 overflow-y-auto p-3 font-mono text-xs leading-relaxed bg-zinc-800/50"
          >
            {logEntries.map(log => (
              <div
                key={log.id}
                className={`cursor-pointer hover:bg-zinc-700/50 ${getLogLevelClass(log.level)}`}
                onClick={() => handleLogClick(log)}
              >
                <span className="text-zinc-500 mr-2">[{formatTimestamp(log.timestamp)}]</span>
                [{log.level}] {log.message}
              </div>
            ))}
          </div>
        )}
      </footer>

      {/* --- Details Panel (Portal) --- */}
      <DetailsPanel
        detailView={detailView}
        isMinimized={isPanelMinimized}
        onClose={handleClosePanel}
        onMinimize={handleMinimizePanel}
      />
    </div>
  );
};

export default App;
