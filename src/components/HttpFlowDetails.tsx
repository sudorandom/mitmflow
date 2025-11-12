import React, { useState, useMemo } from 'react';
import { Flow, Request, Response } from "../gen/mitmflow/v1/mitmflow_pb";
import { Light as SyntaxHighlighter } from 'react-syntax-highlighter';
import { atomOneDark } from 'react-syntax-highlighter/dist/esm/styles/hljs'; // A simple, light theme
import HexViewer from '../HexViewer';
import { ContentFormat, FormattedContent, formatContent, getContentType, getTimestamp, formatSize, formatBytes } from '../utils';
import { ConnectionTab } from './ConnectionTab';
import { TimingRow } from './TimingRow';

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
    headers?: { [key: string]: string }; // To help with auto-selection
    flowPart?: Request | Response;
};

export const RequestResponseView: React.FC<RequestResponseViewProps> = ({ fullContent, bodyContent, format, setFormat, headers, flowPart }) => {
    const [isBodyExpanded, setIsBodyExpanded] = useState(false);
    const headerText = useMemo(() => {
        if (!fullContent) return 'No content captured.';
        const parts = fullContent.split('\n\n');
        return parts[0];
    }, [fullContent]);

    const bodySize = bodyContent?.data ? (typeof bodyContent.data === 'string' ? bodyContent.data.length : bodyContent.data.byteLength) : 0;
    const showBodyByDefault = (bodySize > 0 && bodySize < 10 * 1024) || bodyContent?.effectiveFormat === 'image';

    const effectiveFormat = bodyContent?.effectiveFormat || format;

    return (
        <div>
            <div className="flex items-center justify-end mb-2">
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
            </div>
            <pre className="bg-zinc-800 p-3 rounded text-xs font-mono whitespace-pre-wrap break-all">
                {headerText}
            </pre>
            {flowPart?.trailers && Object.keys(flowPart.trailers).length > 0 && (
                <>
                    <h4 className="text-md font-semibold mt-4 mb-2 pb-2 border-b border-zinc-700">Trailers</h4>
                    <pre className="bg-zinc-800 p-3 rounded text-xs font-mono whitespace-pre-wrap break-all">
                        {Object.entries(flowPart.trailers).map(([k, v]) => `${k}: ${v}`).join('\n')}
                    </pre>
                </>
            )}
            {flowPart?.contentProtoscopeFrames && flowPart.contentProtoscopeFrames.length > 0 ? (
                // Render protoscope frames if they exist
                <div>
                    {flowPart.contentProtoscopeFrames.map((frame, index) => (
                        <div key={index} className="border-b border-zinc-700 py-2">
                            {flowPart.contentProtoscopeFrames.length > 1 && (
                                <h4 className="text-sm font-semibold mb-1">Frame {index + 1}</h4>
                            )}
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
            ) : (
                // Otherwise, render the regular body content (expandable)
                <>
                    {bodySize > 0 && !showBodyByDefault && (
                        <div className="mt-2 text-sm">
                            <a href="#" onClick={(e) => { e.preventDefault(); setIsBodyExpanded(!isBodyExpanded); }} className="text-orange-400 hover:underline">
                                {isBodyExpanded ? 'Collapse' : 'Expand'} body ({formatSize(bodySize)})
                            </a>
                        </div>
                    )}
                    {(showBodyByDefault || isBodyExpanded) && bodyContent && (
                        bodyContent.encoding === 'base64' ? (
                            <img src={`data:${(getContentType(headers) || 'application/octet-stream').split(';')[0]};base64,${bodyContent.data}`} alt="Image content" className="max-w-full h-auto" />
                        ) : bodyContent.encoding === 'binary' ? (
                            <HexViewer data={bodyContent.data instanceof Uint8Array ? bodyContent.data : new Uint8Array()} />
                        ) : (
                            <SyntaxHighlighter
                                language={effectiveFormat === 'json' ? 'json' : (effectiveFormat === 'xml' ? 'xml' : (effectiveFormat === 'javascript' ? 'javascript' : (effectiveFormat === 'html' ? 'html' : 'text')))}
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
                        )
                    )}
                </>
            )}
        </div>
    );
};

export const HttpFlowDetails: React.FC<{
    flow: Flow;
    requestFormat: ContentFormat;
    setRequestFormat: (format: ContentFormat) => void;
    responseFormat: ContentFormat;
    setResponseFormat: (format: ContentFormat) => void;
    contentRef: React.RefObject<HTMLDivElement>;
    downloadFlowContent: (flow: Flow, type: 'har' | 'flow-json' | 'request' | 'response') => void;
    isDownloadOpen: boolean;
    setDownloadOpen: (isOpen: boolean) => void;
    isInfoTooltipOpen: boolean;
    setIsInfoTooltipOpen: (isOpen: boolean) => void;
}> = ({ flow, requestFormat, setRequestFormat, responseFormat, setResponseFormat, contentRef }) => {
    const httpFlow = flow.flow.case === 'httpFlow' ? flow.flow.value : null;

    if (!httpFlow) {
        return null;
    }

    const requestAsText = useMemo(() => {
        if (!httpFlow.request) return '';
        const url = httpFlow.request.prettyUrl || httpFlow.request.url;
        const requestLine = `${httpFlow.request.method} ${url} ${httpFlow.request.httpVersion}`;
        const headers = formatHeaders(httpFlow.request.headers);
        return `${requestLine}\n${headers}`;
    }, [httpFlow.request]);

    const responseAsText = useMemo(() => {
        if (!httpFlow.response) return '';
        const statusLine = `${httpFlow.response.httpVersion} ${httpFlow.response.statusCode}`;
        const headers = formatHeaders(httpFlow.response.headers);
        return `${statusLine}\n${headers}`;
    }, [httpFlow.response]);

    const [selectedTab, setSelectedTab] = useState<'summary' | 'request' | 'response' | 'websocket' | 'connection'>('summary');

    const statusClass = useMemo(() => {
        if (!httpFlow?.response) return 'text-zinc-500';
        if (httpFlow.response.statusCode >= 500) return 'text-red-500 font-bold';
        if (httpFlow.response.statusCode >= 400) return 'text-red-400';
        if (httpFlow.response.statusCode >= 300) return 'text-yellow-400';
        return 'text-green-400';
    }, [httpFlow?.response]);

    const firstRequestByteTimestamp = getTimestamp(httpFlow.request?.timestampStart);

    return (
        <>
            <div className="flex-shrink-0 border-b border-zinc-700">
                <div className="flex items-center px-4">
                    <button
                        className={`px-3 py-2 text-sm font-medium border-b-2 ${selectedTab === 'summary' ? 'border-orange-500 text-orange-500' : 'border-transparent text-zinc-400 hover:text-white'}`}
                        onClick={() => setSelectedTab('summary')}
                    >
                        Summary
                    </button>
                    <button
                        className={`px-3 py-2 text-sm font-medium border-b-2 ${selectedTab === 'request' ? 'border-orange-500 text-orange-500' : 'border-transparent text-zinc-400 hover:text-white'}`}
                        onClick={() => setSelectedTab('request')}
                    >
                        Request
                    </button>
                    <button
                        className={`px-3 py-2 text-sm font-medium border-b-2 ${selectedTab === 'response' ? 'border-orange-500 text-orange-500' : 'border-transparent text-zinc-400 hover:text-white'}`}
                        onClick={() => setSelectedTab('response')}
                    >
                        Response
                    </button>
                    {httpFlow.isWebsocket && (
                        <button
                            className={`px-3 py-2 text-sm font-medium border-b-2 ${selectedTab === 'websocket' ? 'border-orange-500 text-orange-500' : 'border-transparent text-zinc-400 hover:text-white'}`}
                            onClick={() => setSelectedTab('websocket')}
                        >
                            WebSocket
                        </button>
                    )}
                    <button
                        className={`px-3 py-2 text-sm font-medium border-b-2 ${selectedTab === 'connection' ? 'border-orange-500 text-orange-500' : 'border-transparent text-zinc-400 hover:text-white'}`}
                        onClick={() => setSelectedTab('connection')}
                    >
                        Connection
                    </button>
                </div>
            </div>
            <div className="p-5 overflow-y-auto flex-grow" ref={contentRef}>
                {selectedTab === 'summary' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm font-mono">
                        <div className="bg-zinc-800 p-4 rounded">
                            <h5 className="font-semibold text-zinc-400 mb-3 border-b border-zinc-700 pb-2">Flow Details</h5>
                            <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                                <div className="text-zinc-500">ID:</div> <div>{httpFlow.id}</div>
                                <div className="text-zinc-500">Method:</div> <div>{httpFlow.request?.method}</div>
                                <div className="text-zinc-500">Status:</div> <div className={statusClass}>{httpFlow.response?.statusCode}</div>
                                {httpFlow.isWebsocket && <><div className="text-zinc-500">WebSocket:</div> <div>Yes</div></>}
                                <div className="text-zinc-500">URL:</div> <div className="col-span-2 break-all">{httpFlow.request?.prettyUrl || httpFlow.request?.url}</div>
                                <div className="text-zinc-500">Transfer:</div>
                                <div>
                                    <div>Out: {formatBytes(httpFlow.request?.content?.length)} {httpFlow.request?.contentTruncated && <span className="text-yellow-500">(truncated)</span>}</div>
                                    <div>In: {formatBytes(httpFlow.response?.content?.length)} {httpFlow.response?.contentTruncated && <span className="text-yellow-500">(truncated)</span>}</div>
                                </div>

                                <div className="text-zinc-500">Request Content-Type:</div> <div className="break-all">{getContentType(httpFlow.request?.headers) || 'N/A'}</div>
                                {httpFlow.request?.effectiveContentType && getContentType(httpFlow.request?.headers) !== httpFlow.request?.effectiveContentType && (
                                    <>
                                        <div className="text-zinc-500">Detected Request Content-Type:</div>
                                        <div className="break-all">{httpFlow.request?.effectiveContentType}</div>
                                    </>
                                )}
                                <div className="text-zinc-500">Response Content-Type:</div> <div className="break-all">{getContentType(httpFlow.response?.headers) || 'N/A'}</div>
                                {httpFlow.response?.effectiveContentType && getContentType(httpFlow.response?.headers) !== httpFlow.response?.effectiveContentType && (
                                    <>
                                        <div className="text-zinc-500">Detected Response Content-Type:</div>
                                        <div className="break-all">{httpFlow.response?.effectiveContentType}</div>
                                    </>
                                )}
                            </div>
                        {httpFlow.error && (
                            <div className="bg-zinc-800 p-4 rounded col-span-2">
                                <h5 className="font-semibold text-red-400 mb-3 border-b border-zinc-700 pb-2">Error</h5>
                                <div className="text-red-400">{httpFlow.error}</div>
                            </div>
                        )}
                        </div>
                        <div className="bg-zinc-800 p-4 rounded">
                            <h5 className="font-semibold text-zinc-400 mb-3 border-b border-zinc-700 pb-2">Timing</h5>
                            <div className="grid grid-cols-[max-content,1fr] gap-x-4 gap-y-2">
                                <TimingRow label="Client conn. established" timestamp={getTimestamp(httpFlow.client?.timestampStart)} relativeTo={firstRequestByteTimestamp} />
                                <TimingRow label="Server conn. initiated" timestamp={getTimestamp(httpFlow.server?.timestampStart)} relativeTo={firstRequestByteTimestamp} />
                                <TimingRow label="Server conn. TCP handshake" timestamp={getTimestamp(httpFlow.server?.timestampTcpSetup)} relativeTo={firstRequestByteTimestamp} />
                                <TimingRow label="Server conn. TLS handshake" timestamp={getTimestamp(httpFlow.server?.timestampTlsSetup)} relativeTo={firstRequestByteTimestamp} />
                                <TimingRow label="Client conn. TLS handshake" timestamp={getTimestamp(httpFlow.client?.timestampTlsSetup)} relativeTo={firstRequestByteTimestamp} />
                                <TimingRow label="First request byte" timestamp={firstRequestByteTimestamp} relativeTo={firstRequestByteTimestamp} />
                                <TimingRow label="Request Complete" timestamp={getTimestamp(httpFlow.request?.timestampEnd)} relativeTo={firstRequestByteTimestamp} />
                                <TimingRow label="First response byte" timestamp={getTimestamp(httpFlow.response?.timestampStart)} relativeTo={firstRequestByteTimestamp} />
                                <TimingRow label="Response complete" timestamp={getTimestamp(httpFlow.response?.timestampEnd)} relativeTo={firstRequestByteTimestamp} />
                            </div>
                        </div>
                    </div>
                )}
                {selectedTab === 'request' && (
                    <RequestResponseView
                        title="Request"
                        fullContent={requestAsText}
                        bodyContent={formatContent(httpFlow.request?.content, requestFormat, getContentType(httpFlow.request?.headers), httpFlow.request?.effectiveContentType)}
                        format={requestFormat}
                        setFormat={setRequestFormat}
                        headers={httpFlow.request?.headers}
                        flowPart={httpFlow.request}
                    />
                )}
                {selectedTab === 'response' && (
                    <RequestResponseView
                        title="Response"
                        fullContent={responseAsText}
                        bodyContent={formatContent(httpFlow.response?.content, responseFormat, getContentType(httpFlow.response?.headers), httpFlow.response?.effectiveContentType)}
                        format={responseFormat}
                        setFormat={setResponseFormat}
                        headers={httpFlow.response?.headers}
                        flowPart={httpFlow.response}
                    />
                )}
                {selectedTab === 'websocket' && (
                    <div>
                        <h3 className="text-lg font-semibold mb-2">WebSocket Messages</h3>
                        {httpFlow.websocketMessages.map((msg, index) => (
                            <div key={index} className="mt-2">
                                <p className="font-semibold">{msg.fromClient ? 'Client -> Server' : 'Server -> Client'}</p>
                                <HexViewer data={msg.content} />
                            </div>
                        ))}
                    </div>
                )}
                {selectedTab === 'connection' && (
                    <ConnectionTab client={httpFlow.client} server={httpFlow.server} />
                )}
            </div>
        </>
    );
};
