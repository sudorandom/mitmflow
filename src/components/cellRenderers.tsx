import React from 'react';
import { ICellRendererParams } from 'ag-grid-community';
import { Flow, FlowSummary } from '../gen/mitmflow/v1/mitmflow_pb';
import FlowIcon from './FlowIcon';
import { StatusPill } from './StatusPill';
import { formatBytes, formatDuration, formatTimestamp, getFlowTimestampStart, getTimestamp, getSummary } from '../utils';

export const IconCellRenderer: React.FC<ICellRendererParams & { headerName?: string }> = (params) => {
    return <FlowIcon flow={params.data as Flow | FlowSummary} />;
};

export const StatusCellRenderer: React.FC<ICellRendererParams & { headerName?: string }> = (params) => {
    const data = params.data as Flow | FlowSummary;

    // Handle FlowSummary
    const summary = getSummary(data as FlowSummary);
    if (summary && summary.case) {
        switch (summary.case) {
            case 'http': {
                const http = summary.value;
                const statusCode = Number(http.statusCode);
                const statusColor = () => {
                    if (statusCode >= 500) return 'red';
                    if (statusCode >= 400) return 'red';
                    if (statusCode >= 300) return 'yellow';
                    if (statusCode === 0) return 'gray';
                    return 'green';
                };
                return <StatusPill status={statusCode === 0 ? '...' : statusCode} color={statusColor()} />;
            }
            case 'dns':
            case 'tcp':
            case 'udp':
                if (summary.value.error) {
                    return <StatusPill status="Error" color="red" />;
                }
                return <StatusPill status="OK" color="green" />;
        }
    }

    // Handle full Flow
    const flow = data as Flow;
    if (flow && flow.flow) {
        switch (flow.flow.case) {
            case 'tcpFlow':
                const tcpFlow = flow.flow.value;
                if (tcpFlow.error) {
                    return <StatusPill status="Error" color="red" />;
                }
                return <StatusPill status="OK" color="green" />;
            case 'udpFlow':
                const udpFlow = flow.flow.value;
                if (udpFlow.error) {
                    return <StatusPill status="Error" color="red" />;
                }
                return <StatusPill status="OK" color="green" />;
            case 'dnsFlow':
                const dnsFlow = flow.flow.value;
                if (dnsFlow.error) {
                    return <StatusPill status="Error" color="red" />;
                }
                if (dnsFlow.response) {
                    return <StatusPill status="OK" color="green" />;
                }
                return <StatusPill status="Pending" color="gray" />;
            case 'httpFlow':
                const httpFlow = flow.flow.value;
                const statusColor = () => {
                    if (!httpFlow.response) return 'gray';
                    const statusCode = Number(httpFlow.response.statusCode);
                    if (statusCode >= 500) return 'red';
                    if (statusCode >= 400) return 'red';
                    if (statusCode >= 300) return 'yellow';
                    return 'green';
                };
                return <StatusPill status={httpFlow.response?.statusCode ?? '...'} color={statusColor()} />;
        }
    }
    return null;
};

export const RequestCellRenderer: React.FC<ICellRendererParams & { headerName?: string }> = (params) => {
    const data = params.data as Flow | FlowSummary;
    let requestText = '';

    const summary = getSummary(data as FlowSummary);
    if (summary && summary.case) {
        switch (summary.case) {
            case 'http': {
                const http = summary.value;
                const url = http.url || '';
                const queryIndex = url.indexOf('?');
                const baseUrl = queryIndex !== -1 ? url.substring(0, queryIndex) : url;
                requestText = `${http.method} ${baseUrl}`;
                break;
            }
            case 'dns':
                requestText = summary.value.questionName;
                break;
            case 'tcp':
            case 'udp':
                requestText = `${summary.value.serverAddressHost}:${summary.value.serverAddressPort}`;
                break;
        }
    } else {
        const flow = data as Flow;
        if (flow && flow.flow) {
            if (flow.flow.case === 'httpFlow') {
                const httpFlow = flow.flow.value;
                const url = httpFlow.request?.prettyUrl || httpFlow.request?.url || '';
                const queryIndex = url.indexOf('?');
                const baseUrl = queryIndex !== -1 ? url.substring(0, queryIndex) : url;
                requestText = `${httpFlow.request?.method} ${baseUrl}`;
            } else if (flow.flow.case === 'dnsFlow') {
                const dnsFlow = flow.flow.value;
                requestText = dnsFlow.request?.questions[0]?.name || '';
            } else if (flow.flow.case === 'tcpFlow') {
                const tcpFlow = flow.flow.value;
                requestText = `${tcpFlow.server?.addressHost}:${tcpFlow.server?.addressPort}`;
            } else if (flow.flow.case === 'udpFlow') {
                const udpFlow = flow.flow.value;
                requestText = `${udpFlow.server?.addressHost}:${udpFlow.server?.addressPort}`;
            }
        }
    }

    return (
        <div className="flex items-center gap-2">
            <FlowIcon flow={data} />
            <span className="truncate">{requestText}</span>
        </div>
    );
};

export const InTransferCellRenderer: React.FC<ICellRendererParams & { headerName?: string }> = (params) => {
    const data = params.data as Flow | FlowSummary;

    const summary = getSummary(data as FlowSummary);
    if (summary && summary.case) {
        switch (summary.case) {
            case 'http':
                return <span>{formatBytes(Number(summary.value.responseContentLength))}</span>;
            case 'tcp':
            case 'udp':
            case 'dns':
                return <span>-</span>;
            default:
                return <span>-</span>;
        }
    }

    const flow = data as Flow;
    if (flow && flow.flow) {
        switch (flow.flow.case) {
            case 'httpFlow': {
                const httpFlow = flow.flow.value;
                return <span>{formatBytes(httpFlow.response?.content?.length)}</span>;
            }
            case 'tcpFlow': {
                const tcpFlow = flow.flow.value;
                const bytes = tcpFlow.messages?.filter(m => !m.fromClient).reduce((sum, m) => sum + (m.content?.length || 0), 0) ?? 0;
                return <span>{formatBytes(bytes)}</span>;
            }
            case 'udpFlow': {
                const udpFlow = flow.flow.value;
                const bytes = udpFlow.messages?.filter(m => !m.fromClient).reduce((sum, m) => sum + (m.content?.length || 0), 0) ?? 0;
                return <span>{formatBytes(bytes)}</span>;
            }
            case 'dnsFlow': {
                const dnsFlow = flow.flow.value;
                return <span>{formatBytes(dnsFlow.response?.packed?.length)}</span>;
            }
        }
    }
    return <span>-</span>;
};

export const OutTransferCellRenderer: React.FC<ICellRendererParams & { headerName?: string }> = (params) => {
    const data = params.data as Flow | FlowSummary;

    const summary = getSummary(data as FlowSummary);
    if (summary && summary.case) {
        switch (summary.case) {
            case 'http':
                return <span>{formatBytes(Number(summary.value.requestContentLength))}</span>;
            case 'tcp':
            case 'udp':
            case 'dns':
                return <span>-</span>;
            default:
                return <span>-</span>;
        }
    }

    const flow = data as Flow;
    if (flow && flow.flow) {
        switch (flow.flow.case) {
            case 'httpFlow': {
                const httpFlow = flow.flow.value;
                return <span>{formatBytes(httpFlow.request?.content?.length)}</span>;
            }
            case 'tcpFlow': {
                const tcpFlow = flow.flow.value;
                const bytes = tcpFlow.messages?.filter(m => m.fromClient).reduce((sum, m) => sum + (m.content?.length || 0), 0) ?? 0;
                return <span>{formatBytes(bytes)}</span>;
            }
            case 'udpFlow': {
                const udpFlow = flow.flow.value;
                const bytes = udpFlow.messages?.filter(m => m.fromClient).reduce((sum, m) => sum + (m.content?.length || 0), 0) ?? 0;
                return <span>{formatBytes(bytes)}</span>;
            }
            case 'dnsFlow': {
                const dnsFlow = flow.flow.value;
                return <span>{formatBytes(dnsFlow.request?.packed?.length)}</span>;
            }
        }
    }
    return <span>-</span>;
};

export const DurationCellRenderer: React.FC<ICellRendererParams & { headerName?: string }> = (params) => {
    const data = params.data as Flow | FlowSummary;

    const summary = getSummary(data as FlowSummary);
    if (summary && summary.case) {
        switch (summary.case) {
            case 'http':
                return <span>{formatDuration(Number(summary.value.durationMs))}</span>;
            case 'tcp':
            case 'udp':
            case 'dns':
                return <span>-</span>;
            default:
                return <span>-</span>;
        }
    }

    const flow = data as Flow;
    if (flow && flow.flow) {
        switch (flow.flow.case) {
            case 'httpFlow': {
                const httpFlow = flow.flow.value;
                return <span>{formatDuration(Number(httpFlow.durationMs))}</span>;
            }
            case 'tcpFlow': {
                const tcpFlow = flow.flow.value;
                return <span>{formatDuration(Number(tcpFlow.durationMs))}</span>;
            }
            case 'udpFlow': {
                const udpFlow = flow.flow.value;
                return <span>{formatDuration(Number(udpFlow.durationMs))}</span>;
            }
            case 'dnsFlow': {
                const dnsFlow = flow.flow.value;
                return <span>{formatDuration(Number(dnsFlow.durationMs))}</span>;
            }
        }
    }
    return <span>-</span>;
};

export const TimestampCellRenderer: React.FC<ICellRendererParams & { headerName?: string }> = (params) => {
    const data = params.data as Flow | FlowSummary;
    const timestamp = getFlowTimestampStart(data);
    if (timestamp) {
        const ms = getTimestamp(timestamp);
        return <span>{formatTimestamp(ms)}</span>;
    }
    return null;
};
