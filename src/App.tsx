import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Search, Pause, Play, X, Download, FileText, Braces, HardDriveDownload, Info, Menu } from 'lucide-react';
import { createConnectTransport } from "@connectrpc/connect-web";
import { createClient } from "@connectrpc/connect";
import { Service, Flow, FlowSchema, Request, Response } from "./gen/mitmflow/v1/mitmflow_pb";
import { Light as SyntaxHighlighter } from 'react-syntax-highlighter';
import { atomOneDark } from 'react-syntax-highlighter/dist/esm/styles/hljs'; // A simple, light theme
import HexViewer from './HexViewer';
import { toJson } from "@bufbuild/protobuf";

type ContentFormat = 'auto' | 'text' | 'json' | 'protobuf' | 'grpc' | 'grpc-web' | 'xml' | 'binary' | 'image' | 'dns' | 'javascript';

const formatTimestamp = (ts: number): string => {
  const date = new Date(ts);
  return date.toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }) + '.' + date.getMilliseconds().toString().padStart(3, '0');
};

type FormattedContent = {
  data: string | Uint8Array;
  encoding: 'text' | 'base64' | 'binary'; // 'binary' for Uint8Array that HexViewer expects
  effectiveFormat: ContentFormat;
};

const formatContent = (content: Uint8Array | string | undefined, format: ContentFormat, contentTypeHeader?: string): FormattedContent => {
  let effectiveFormat = format;
  if (format === 'auto' && contentTypeHeader) {
    if (contentTypeHeader.includes('json')) {
      effectiveFormat = 'json';
    } else if (contentTypeHeader.includes('application/grpc-web')) {
      effectiveFormat = 'grpc-web';
    } else if (contentTypeHeader.includes('application/grpc')) {
      effectiveFormat = 'grpc';
    } else if (contentTypeHeader.includes('application/proto')) {
      effectiveFormat = 'protobuf';
    } else if (contentTypeHeader.includes('image')) {
      effectiveFormat = 'image';
    } else if (contentTypeHeader.includes('xml')) {
      effectiveFormat = 'xml';
    } else if (contentTypeHeader.includes('text')) {
      effectiveFormat = 'text';
    } else if (contentTypeHeader.includes('javascript')) {
      effectiveFormat = 'javascript';
    } else if (contentTypeHeader.includes('application/octet')) {
      effectiveFormat = 'binary';
    } else if (contentTypeHeader.includes('dns')) {
      effectiveFormat = 'dns';
    }
  }

  if (!content) {
    switch (effectiveFormat) {
      case 'binary':
      case 'protobuf':
      case 'grpc':
      case 'grpc-web':
        return { data: new Uint8Array(), encoding: 'binary', effectiveFormat: effectiveFormat };
      default:
        return { data: '', encoding: 'text', effectiveFormat: 'text' };
    }
  }

  const contentAsUint8Array = typeof content === 'string' ? new TextEncoder().encode(content) : content;
  const contentAsString = typeof content === 'string' ? content : new TextDecoder().decode(contentAsUint8Array);

  switch (effectiveFormat) {
    case 'json':
      try {
        return { data: JSON.stringify(JSON.parse(contentAsString), null, 2), encoding: 'text', effectiveFormat: effectiveFormat };
      } catch {
        return { data: contentAsString, encoding: 'text', effectiveFormat: effectiveFormat };
      }
    case 'xml':
    case 'javascript':
    case 'dns':
    case 'text':
    case 'auto': // Fallback to text if auto-detection failed or not applicable
      return { data: contentAsString, encoding: 'text', effectiveFormat: effectiveFormat };
    case 'image':
      // For images, we want to base64 encode the Uint8Array
      return { data: btoa(String.fromCharCode(...contentAsUint8Array)), encoding: 'base64', effectiveFormat: effectiveFormat };
    case 'binary':
    case 'protobuf':
    case 'grpc':
    case 'grpc-web':
    default:
      return { data: contentAsUint8Array, encoding: 'binary', effectiveFormat: effectiveFormat };
  }
};

const getHarContent = (content: Uint8Array | undefined, contentTypeHeader?: string) => {
  if (!content || content.length === 0) {
    return { text: '', mimeType: contentTypeHeader || 'application/octet-stream' };
  }

  const contentAsString = new TextDecoder().decode(content);
  const mimeType = contentTypeHeader || 'application/octet-stream';

  // Check for common text-based content types
  if (mimeType.includes('json') || mimeType.includes('xml') || mimeType.includes('text')) {
    return { text: contentAsString, mimeType: mimeType };
  } else {
    // For other types (binary, image, etc.), base64 encode
    return { text: btoa(String.fromCharCode(...content)), mimeType: mimeType, encoding: 'base64' };
  }
};

// New function to generate HAR blob
const generateHarBlob = (flowsToExport: Flow[]): Blob => {
  const har = {
    log: {
      version: "1.2",
      creator: { name: "mitm-flows", version: "1.0" },
      entries: flowsToExport.map(flow => {
        const httpFlow = flow?.flow?.case === 'httpFlow' ? flow.flow?.value : null;

        if (!flow || !httpFlow) {
          return {}; // Skip this entry if httpFlow is not available
        }

        return {
          startedDateTime: new Date(getTimestamp(httpFlow.timestampStart)).toISOString(),
          time: httpFlow.durationMs,
          request: {
            method: httpFlow.request?.method || '',
            url: httpFlow.request?.url || '',
            httpVersion: "HTTP/1.1", headers: [], queryString: [], cookies: [],
            postData: getHarContent(httpFlow.request?.content, httpFlow.request?.headers['Content-Type'])
          },
          response: {
            status: httpFlow.response?.statusCode || 0, statusText: "OK", httpVersion: "HTTP/1.1", headers: [], cookies: [],
            content: getHarContent(httpFlow.response?.content, httpFlow.response?.headers['Content-Type'])
          }
        };
      })
    }
  };
  return new Blob([JSON.stringify(har, null, 2)], { type: 'application/json;charset=utf-8' });
};

// --- HELPER COMPONENTS ---

const formatHeaders = (headers: { [key: string]: string }): string => {
  return Object.entries(headers)
    .map(([key, value]) => `${key}: ${value}`)
    .join('\n');
};

type RequestResponseViewProps = {
  title: string;
  fullContent?: string;
  bodyContent?: FormattedContent; // Allow Uint8Array for binary
  format: ContentFormat;
  setFormat: (format: ContentFormat) => void;
  contentTypeHeader?: string; // To help with auto-selection
  flowPart?: Request | Response;
};

const RequestResponseView: React.FC<RequestResponseViewProps> = ({ title, fullContent, bodyContent, format, setFormat, contentTypeHeader, flowPart }) => {
  const [isBodyExpanded, setIsBodyExpanded] = useState(false);
  const headers = useMemo(() => {
    if (!fullContent) return 'No content captured.';
    const parts = fullContent.split('\n\n');
    return parts[0];
  }, [fullContent]);

  const bodySize = bodyContent?.data ? (typeof bodyContent.data === 'string' ? bodyContent.data.length : bodyContent.data.byteLength) : 0;
  const showBodyByDefault = (bodySize > 0 && bodySize < 1024) || bodyContent?.effectiveFormat === 'image';

  const effectiveFormat = bodyContent?.effectiveFormat || format;

  return (
    <div>
      <h3 className="text-lg font-semibold mb-2 pb-2 border-b border-zinc-700 flex items-center justify-between">
        {title}
        <select
          className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs"
          value={format}
          onChange={(e) => setFormat(e.target.value as ContentFormat)}
        >
          <option value="auto">Auto</option>
          <option value="text">Text</option>
          <option value="json">JSON</option>
          <option value="protobuf">Protobuf</option>
          <option value="grpc">gRPC</option>
          <option value="grpc-web">gRPC-Web</option>
          <option value="xml">XML</option>
          <option value="binary">Binary</option>
          <option value="image">Image</option>
          <option value="dns">DNS</option>
          <option value="javascript">JavaScript</option>
        </select>
      </h3>
      <pre className="bg-zinc-800 p-3 rounded text-xs font-mono whitespace-pre-wrap break-all">
        {headers}
      </pre>
      {flowPart?.trailers && Object.keys(flowPart.trailers).length > 0 && (
        <>
            <h4 className="text-md font-semibold mt-4 mb-2 pb-2 border-b border-zinc-700">Trailers</h4>
            <pre className="bg-zinc-800 p-3 rounded text-xs font-mono whitespace-pre-wrap break-all">
                {Object.entries(flowPart.trailers).map(([k, v]) => `${k}: ${v}`).join('\n')}
            </pre>
        </>
      )}
      {bodySize > 0 && !showBodyByDefault && (
        <div className="mt-2 text-sm">
          <a href="#" onClick={(e) => { e.preventDefault(); setIsBodyExpanded(!isBodyExpanded); }} className="text-orange-400 hover:underline">
            {isBodyExpanded ? 'Collapse' : 'Expand'} body ({bodySize} bytes)
          </a>
        </div>
      )}
      {(showBodyByDefault || isBodyExpanded) && (
        (() => {
          if ((effectiveFormat === 'protobuf' || effectiveFormat === 'grpc' || effectiveFormat === 'grpc-web') && flowPart?.contentProtoscopeFrames && flowPart.contentProtoscopeFrames.length > 0) {
            return (
              <div>
                {flowPart.contentProtoscopeFrames.map((frame, index) => (
                  <div key={index} className="border-b border-zinc-700 py-2">
                    <h4 className="text-sm font-semibold mb-1">Frame {index + 1}</h4>
                    <SyntaxHighlighter
                      language={'protobuf'}
                      style={atomOneDark}
                      customStyle={{
                        backgroundColor: '#27272a',
                        padding: '1rem',
                        borderRadius: '0.25rem',
                        fontSize: '0.75rem',
                        fontFamily: 'monospace',
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-all',
                        marginTop: '0.5rem',
                      }}
                      showLineNumbers={false}
                    >
                      {frame}
                    </SyntaxHighlighter>
                  </div>
                ))}
              </div>
            );
          }

          if (bodyContent) {
            if (bodyContent.encoding === 'base64') {
              return <img src={`data:${(contentTypeHeader || 'application/octet-stream').split(';')[0]};base64,${bodyContent.data}`} alt="Image content" className="max-w-full h-auto" />;
            }
            if (bodyContent.encoding === 'binary') {
              return <HexViewer data={bodyContent.data instanceof Uint8Array ? bodyContent.data : new Uint8Array()} />;
            }
            return (
              <SyntaxHighlighter
                language={format === 'json' ? 'json' : (format === 'xml' ? 'xml' : (format === 'javascript' ? 'javascript' : 'text'))}
                style={atomOneDark}
                customStyle={{
                  backgroundColor: '#27272a',
                  padding: '1rem',
                  borderRadius: '0.25rem',
                  fontSize: '0.75rem',
                  fontFamily: 'monospace',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all',
                  marginTop: '0.5rem',
                }}
                showLineNumbers={false}
              >
                {bodyContent.data as string}
              </SyntaxHighlighter>
            );
          }
          return null;
        })()
      )}
    </div>
  );
};



interface TimestampWithSecondsNanos {
  seconds: bigint;
  nanos: number;
}

type TimestampInput = TimestampWithSecondsNanos | undefined;

const getTimestamp = (ts: TimestampInput): number => {
  if (!ts) {
    return 0;
  }
  return Number(ts.seconds) * 1000 + ts.nanos / 1000000;
}

const getFlowId = (flow: Flow | undefined | null): string | undefined => {
  if (flow?.flow?.case === 'httpFlow' && flow.flow.value) {
    return flow.flow.value.id;
  }
  return undefined;
};

/**
 * Renders a single flow row in the table
 */
const FlowRow: React.FC<{
    flow: Flow;
    isSelected: boolean;
    onMouseDown: (flow: Flow, event: React.MouseEvent) => void;
    onMouseEnter: (flow: Flow) => void;
}> = ({ flow: flow, isSelected, onMouseDown, onMouseEnter }) => {
  if (!flow || !flow.flow || flow.flow.case !== 'httpFlow') {
    // For now, we only render HTTP flows.
    return null;
  }
  const httpFlow = flow.flow.value;

  const statusClass = useMemo(() => {
    if (!httpFlow.response) return 'text-zinc-500';
    if (httpFlow.response.statusCode >= 500) return 'text-red-500 font-bold';
    if (httpFlow.response.statusCode >= 400) return 'text-red-400';
    if (httpFlow.response.statusCode >= 300) return 'text-yellow-400';
    return 'text-green-400';
  }, [httpFlow.response]);

  const url = useMemo(() => {
    try {
      return new URL(httpFlow.request?.url || '');
    } catch {
      return null;
    }
  }, [httpFlow.request?.url]);

  return (
    <tr
      className={`border-b border-zinc-800 cursor-pointer select-none ${isSelected ? 'bg-orange-900/30 hover:bg-orange-900/40' : 'hover:bg-zinc-800/50'}`}
      onMouseDown={(event) => onMouseDown(flow, event)}
      onMouseEnter={() => onMouseEnter(flow)}
      data-flow-id={httpFlow.id} // Add data-attribute for scrolling
    >
      <td className={`p-3 font-mono max-w-xs overflow-hidden text-ellipsis whitespace-nowrap ${statusClass}`}>{httpFlow.response?.statusCode ?? '...'}</td>
      <td className="p-3 font-mono max-w-xs overflow-hidden text-ellipsis whitespace-nowrap">{httpFlow.request?.method} {url?.toString()}</td>
      <td className="hidden md:table-cell p-3 font-mono max-w-xs overflow-hidden text-ellipsis whitespace-nowrap">{httpFlow.response ? `${httpFlow.response.content.length} B` : '...'}</td>
      <td className="hidden md:table-cell p-3 font-mono max-w-xs overflow-hidden text-ellipsis whitespace-nowrap">{httpFlow.durationMs ? `${httpFlow.durationMs.toFixed(0)} ms` : '...'}</td>
    </tr>
  );
};

/**
 * Renders the slide-up details panel
 */
const DetailsPanel: React.FC <{
  flow: Flow | null;
  isMinimized: boolean;
  onClose: () => void;
  panelHeight: number | null;
  setPanelHeight: (height: number) => void;
  requestFormat: ContentFormat;
  setRequestFormat: (format: ContentFormat) => void;
  responseFormat: ContentFormat;
  setResponseFormat: (format: ContentFormat) => void;
  downloadFlowContent: (flow: Flow, type: 'har' | 'flow-json' | 'request' | 'response') => void;
  isDownloadOpen: boolean;
  setDownloadOpen: React.Dispatch<React.SetStateAction<boolean>>;
  isInfoTooltipOpen: boolean;
  setIsInfoTooltipOpen: React.Dispatch<React.SetStateAction<boolean>>;
  contentRef: React.RefObject<HTMLDivElement>;
}> = ({ flow, isMinimized, onClose, panelHeight, setPanelHeight, requestFormat, setRequestFormat, responseFormat, setResponseFormat, downloadFlowContent, isDownloadOpen, setDownloadOpen, isInfoTooltipOpen, setIsInfoTooltipOpen, contentRef }) => {
  const httpFlow = flow?.flow.case === 'httpFlow' ? flow.flow.value : null;

  if (!flow || !httpFlow) {
    return null;
  }

  const requestAsText = useMemo(() => {
    if (!httpFlow.request) return '';
    const requestLine = `${httpFlow.request.method} ${httpFlow.request.url} ${httpFlow.request.httpVersion}`;
    const headers = formatHeaders(httpFlow.request.headers);
    return `${requestLine}\n${headers}`;
  }, [httpFlow.request]);

  const responseAsText = useMemo(() => {
    if (!httpFlow.response) return '';
    const statusLine = `${httpFlow.response.httpVersion} ${httpFlow.response.statusCode}`;
    const headers = formatHeaders(httpFlow.response.headers);
    return `${statusLine}\n${headers}`;
  }, [httpFlow.response]);

  const [isResizing, setIsResizing] = useState(false);

  const statusClass = useMemo(() => {
    if (!httpFlow?.response) return 'text-zinc-500';
    if (httpFlow.response.statusCode >= 500) return 'text-red-500 font-bold';
    if (httpFlow.response.statusCode >= 400) return 'text-red-400';
    if (httpFlow.response.statusCode >= 300) return 'text-yellow-400';
    return 'text-green-400';
  }, [httpFlow?.response]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    setIsResizing(true);
    e.preventDefault(); // Prevent text selection during drag
  }, []);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isResizing) return;
    const newHeight = window.innerHeight - e.clientY;
    setPanelHeight(Math.max(50, newHeight)); // Minimum height of 50px
  }, [isResizing, setPanelHeight]);

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

  return (
    <div
      className={`absolute bottom-0 left-0 right-0 bg-zinc-900 border-t border-zinc-700 flex flex-col z-40 transition-all duration-200 ease-out ${isMinimized ? 'h-0' : ''}`}
      style={{ height: isMinimized ? '0px' : `${panelHeight}px` }}
    >
      <div
        className="absolute top-0 left-0 right-0 h-2 -mt-1 cursor-ns-resize z-50"
        onMouseDown={handleMouseDown}
      />
      <div
        className="flex items-center p-2.5 px-4 bg-zinc-800 border-b border-zinc-700 flex-shrink-0"
      >
        <h4 className="font-semibold font-mono text-sm text-ellipsis overflow-hidden whitespace-nowrap">
          {httpFlow && <span className={`mr-2 ${statusClass}`}>{httpFlow.response?.statusCode ?? '...'}</span>}
          {httpFlow ? httpFlow.request?.url : ''}
        </h4>
        <div className="ml-auto flex items-center gap-4">
          {httpFlow && (
            <>
              <div className="hidden md:flex items-center gap-4 text-sm font-mono text-zinc-400">
                <div><strong className="text-zinc-500">Time:</strong> {formatTimestamp(getTimestamp(httpFlow.timestampStart))}</div>
                <div><strong className="text-zinc-500">Latency:</strong> {httpFlow.durationMs ? `${httpFlow.durationMs.toFixed(0)} ms` : '...'}</div>
                {httpFlow.live && <div><strong className="text-zinc-500">Live</strong></div>}
                {httpFlow.isWebsocket && <div><strong className="text-zinc-500">WebSocket</strong></div>}
                {httpFlow.serverConnAddress && <div><strong className="text-zinc-500">Server:</strong> {httpFlow.serverConnAddress}</div>}
                {httpFlow.error && <div><strong className="text-red-500">Error:</strong> {httpFlow.error}</div>}
              </div>
              <div className="relative inline-block">
                <button
                  onClick={(e) => { e.stopPropagation(); setDownloadOpen(o => !o); }}
                  className="p-1.5 bg-zinc-700 rounded text-sm font-medium hover:bg-zinc-600"
                  title="Download"
                >
                  <Download size={14} />
                </button>
                {isDownloadOpen && (
                  <div className={`absolute right-0 bg-zinc-800 border border-zinc-700 rounded shadow-lg z-10 min-w-[180px] ${isMinimized ? 'bottom-full mb-2' : 'top-full mt-2'}`}>
                    <a
                      href="#"
                      onClick={(e) => { e.preventDefault(); downloadFlowContent(flow, 'har'); }}
                      className="flex items-center gap-3 px-4 py-2.5 text-sm text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200"
                    >
                      <HardDriveDownload size={16} /> Download HAR
                    </a>
                    <a
                      href="#"
                      onClick={(e) => { e.preventDefault(); downloadFlowContent(flow, 'flow-json'); }}
                      className="flex items-center gap-3 px-4 py-2.5 text-sm text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200"
                    >
                      <Braces size={16} /> Download Flow (JSON)
                    </a>
                    <a
                      href="#"
                      onClick={(e) => { e.preventDefault(); downloadFlowContent(flow, 'request'); }}
                      className="flex items-center gap-3 px-4 py-2.5 text-sm text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200"
                    >
                      <FileText size={16} /> Download Request
                    </a>
                    <a
                      href="#"
                      onClick={(e) => { e.preventDefault(); downloadFlowContent(flow, 'response'); }}
                      className="flex items-center gap-3 px-4 py-2.5 text-sm text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200"
                    >
                      <Braces size={16} /> Download Response
                    </a>
                  </div>
                )}
              </div>
              <div className="relative md:hidden">
                <button
                  onMouseEnter={() => setIsInfoTooltipOpen(true)}
                  onMouseLeave={() => setIsInfoTooltipOpen(false)}
                  className="p-1.5 bg-zinc-700 rounded text-sm font-medium hover:bg-zinc-600"
                >
                  <Info size={14} />
                </button>
                {isInfoTooltipOpen && (
                  <div className="absolute right-0 bottom-full mb-2 bg-zinc-800 border border-zinc-700 rounded shadow-lg z-10 p-4 min-w-[250px]">
                    <div className="flex flex-col gap-2 text-sm font-mono text-zinc-400">
                      <div><strong className="text-zinc-500">Time:</strong> {formatTimestamp(getTimestamp(httpFlow.timestampStart))}</div>
                      <div><strong className="text-zinc-500">Latency:</strong> {httpFlow.durationMs ? `${httpFlow.durationMs.toFixed(0)} ms` : '...'}</div>
                      {httpFlow.live && <div><strong className="text-zinc-500">Live</strong></div>}
                      {httpFlow.isWebsocket && <div><strong className="text-zinc-500">WebSocket</strong></div>}
                      {httpFlow.serverConnAddress && <div><strong className="text-zinc-500">Server:</strong> {httpFlow.serverConnAddress}</div>}
                      {httpFlow.error && <div><strong className="text-red-500">Error:</strong> {httpFlow.error}</div>}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
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
      <div className={`p-5 overflow-y-auto flex-grow ${isMinimized ? 'hidden' : ''}`} ref={contentRef}>
        {flow && (
          <div className="grid grid-cols-1 gap-4">
            <RequestResponseView
              title="Request"
              fullContent={requestAsText}
              bodyContent={formatContent(httpFlow.request?.content, requestFormat, httpFlow.request?.headers['Content-Type'])}
              format={requestFormat}
              setFormat={setRequestFormat}
              contentTypeHeader={httpFlow.request?.headers['Content-Type']}
              flowPart={httpFlow.request}
            />
            <RequestResponseView
              title="Response"
              fullContent={responseAsText}
              bodyContent={formatContent(httpFlow.response?.content, responseFormat, httpFlow.response?.headers['Content-Type'])}
              format={responseFormat}
              setFormat={setResponseFormat}
              contentTypeHeader={httpFlow.response?.headers['Content-Type']}
              flowPart={httpFlow.response}
            />
          </div>
        )}

      </div>
    </div>
  );
};
// --- MAIN APP COMPONENT ---

type ConnectionStatus = 'connecting' | 'live' | 'paused' | 'failed';

const App: React.FC = () => {
  const client = useMemo(() => createClient(Service, createConnectTransport({ baseUrl: "http://localhost:50051" })), []);
  // --- State ---
  const [flows, setFlows] = useState<Flow[]>([]);
  const [isPaused, setIsPaused] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('connecting');
  const [filterText, setFilterText] = useState('');
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
      const headers = formatHeaders(httpFlow.request.headers);
      return `${requestLine}\n${headers}`;
    })();

    const responseAsText = (() => {
      if (!httpFlow.response) return '';
      const statusLine = `${httpFlow.response.httpVersion} ${httpFlow.response.statusCode}`;
      const headers = formatHeaders(httpFlow.response.headers);
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
            return [incomingFlow, ...prevFlows.slice(0, 499)];
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
  }, [isPaused]);


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

  // --- Derived State (Filtering) ---
  const filteredFlows = useMemo(() => {
    const filter = filterText.toLowerCase();
    if (!filter) {
      // Ensure all flows have a defined flow.flow before returning
      return flows.filter(response => response.flow && response.flow.flow);
    }
    
    return flows.filter(response => {
      if (!response.flow || !response.flow.flow || response.flow.flow.case !== 'httpFlow') return false;
      const httpFlow = response.flow.flow.value;
      const url = httpFlow.request?.url || '';
      const filterText = `${url} ${httpFlow.request?.method} ${httpFlow.response?.statusCode}`.toLowerCase();
      return filterText.includes(filter);
    });
  }, [flows, filterText]); // Dependencies: re-run when flows or filter text change

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
      const flowsToExport = selectedFlows.map(response => response.flow).filter((f): f is Flow => f !== undefined);
      blob = generateHarBlob(flowsToExport);
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
              <Menu size={14} />
            </button>
            {isMenuOpen && (
              <div className="absolute right-0 mt-2 w-48 bg-zinc-800 border border-zinc-700 rounded-md shadow-lg z-20">
                <button
                  onClick={() => { togglePause(); setIsMenuOpen(false); }}
                  className="block w-full text-left px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-700 flex items-center gap-1.5"
                >
                  {isPaused ? <Play size={14} /> : <Pause size={14} />}
                  {isPaused ? 'Resume' : 'Pause'}
                </button>
                <button
                  onClick={() => { handleClearFlows(); setIsMenuOpen(false); }}
                  className="block w-full text-left px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-700 flex items-center gap-1.5"
                >
                  Clear Flows
                </button>
                <div className="relative inline-block w-full" ref={bulkDownloadRef}>
                  <button
                    onClick={(e) => { e.stopPropagation(); setIsBulkDownloadOpen(o => !o); }}
                    disabled={selectedFlowIds.size === 0}
                    className="block w-full text-left px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
                  >
                    <Download size={14} />
                    Download ({selectedFlowIds.size})
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
              </div>
            )}
          </div>
          <div className="hidden md:flex items-center gap-2">
            <button
              onClick={togglePause}
              className="bg-zinc-800 border border-zinc-700 text-zinc-200 px-3 py-1 rounded-full text-sm font-medium flex items-center gap-1.5 hover:bg-zinc-700"
            >
              {isPaused ? <Play size={14} /> : <Pause size={14} />}
              {isPaused ? 'Resume' : 'Pause'}
            </button>
            
            <button
              onClick={handleClearFlows}
              className="bg-zinc-800 border border-zinc-700 text-zinc-200 px-3 py-1 rounded-full text-sm font-medium flex items-center gap-1.5 hover:bg-zinc-700"
            >
              Clear Flows
            </button>

            {/* Bulk Download Button with Dropdown */}
            <div className="relative inline-block" ref={bulkDownloadRef}>
              <button
                onClick={(e) => { e.stopPropagation(); setIsBulkDownloadOpen(o => !o); }}
                disabled={selectedFlowIds.size === 0}
                className="bg-zinc-800 border border-zinc-700 text-zinc-200 px-3 py-1 rounded-full text-sm font-medium flex items-center gap-1.5 hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Download size={14} />
                Download ({selectedFlowIds.size})
              </button>
              {isBulkDownloadOpen && (
                <div className="absolute right-0 bg-zinc-800 border border-zinc-700 rounded shadow-lg z-50 min-w-[180px] top-full mt-2">
                  <a
                    href="#"
                    onClick={(e) => { e.preventDefault(); handleDownloadSelectedFlows('har'); setIsBulkDownloadOpen(false); }}
                    className="flex items-center gap-3 px-4 py-2.5 text-sm text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200"
                  >
                    <HardDriveDownload size={16} /> Download HAR
                  </a>
                  <a
                    href="#"
                    onClick={(e) => { e.preventDefault(); handleDownloadSelectedFlows('json'); setIsBulkDownloadOpen(false); }}
                    className="flex items-center gap-3 px-4 py-2.5 text-sm text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200"
                  >
                    <Braces size={16} /> Download Flows (JSON)
                  </a>
                </div>
              )}
            </div>
          </div>
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
          <thead className="sticky top-0 bg-zinc-800">
            <tr>
              <th className="p-3 text-left font-medium text-zinc-500 border-b-2 border-zinc-700 w-[5%] md:w-[5%]">Status</th>
              <th className="p-3 text-left font-medium text-zinc-500 border-b-2 border-zinc-700 w-[85%] md:w-[75%]">Request</th>
              <th className="hidden md:table-cell p-3 text-left font-medium text-zinc-500 border-b-2 border-zinc-700 w-[8%]">Size</th>
              <th className="hidden md:table-cell p-3 text-left font-medium text-zinc-500 border-b-2 border-zinc-700 w-[7%]">Duration</th>
            </tr>
          </thead>
          <tbody>
            {filteredFlows.map(flow => (
              <FlowRow
                key={getFlowId(flow) || 'unknown'}
                flow={flow}
                isSelected={(() => {
                  const flowId = getFlowId(flow);
                  return flowId ? selectedFlowIds.has(flowId) : false;
                })()}
                onMouseDown={handleFlowMouseDown}
                onMouseEnter={handleRowMouseEnter}
              />
            ))}
          </tbody>
        </table>
      </main>

      {/* --- Details Panel --- */}
      <DetailsPanel
        flow={selectedFlow}
        isMinimized={isPanelMinimized}
        onClose={handleClosePanel}
        panelHeight={detailsPanelHeight}
        setPanelHeight={setDetailsPanelHeight}
        requestFormat={
          selectedFlow && getFlowId(selectedFlow) ? (requestFormats.get(getFlowId(selectedFlow)!) || 'auto') : 'auto'
        }
        setRequestFormat={useCallback((format) => {
          if (selectedFlow && getFlowId(selectedFlow)) {
            handleSetRequestFormat(getFlowId(selectedFlow)!, format);
          }
        }, [selectedFlow, handleSetRequestFormat])}
        responseFormat={
          selectedFlow && getFlowId(selectedFlow) ? (responseFormats.get(getFlowId(selectedFlow)!) || 'auto') : 'auto'
        }
        setResponseFormat={useCallback((format) => {
          if (selectedFlow && getFlowId(selectedFlow)) {
            handleSetResponseFormat(getFlowId(selectedFlow)!, format);
          }
        }, [selectedFlow, handleSetResponseFormat])}
        downloadFlowContent={downloadFlowContent}
        isDownloadOpen={isDownloadOpen}
        setDownloadOpen={setDownloadOpen}
        isInfoTooltipOpen={isInfoTooltipOpen}
        setIsInfoTooltipOpen={setIsInfoTooltipOpen}
        contentRef={contentRef}
      />
    </div>
  );
};

export default App;