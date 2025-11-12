import React from 'react';
import { ICellRendererParams } from 'ag-grid-community';
import { Flow } from '../gen/mitmflow/v1/mitmflow_pb';
import FlowIcon from './FlowIcon';
import { StatusPill } from './StatusPill';
import { formatBytes, formatDuration } from '../utils';

export const IconCellRenderer: React.FC<ICellRendererParams> = (params) => {
    return <FlowIcon flow={params.data} />;
};

export const StatusCellRenderer: React.FC<ICellRendererParams> = (params) => {
    const flow = params.data as Flow;
    if (flow.flow?.case === 'httpFlow') {
        const httpFlow = flow.flow.value;
        const statusColor = () => {
            if (!httpFlow.response) return 'gray';
            if (httpFlow.response.statusCode >= 500) return 'red';
            if (httpFlow.response.statusCode >= 400) return 'red';
            if (httpFlow.response.statusCode >= 300) return 'yellow';
            return 'green';
        };
        return <StatusPill status={httpFlow.response?.statusCode ?? '...'} color={statusColor()} />;
    }
    return null;
};

export const RequestCellRenderer: React.FC<ICellRendererParams> = (params) => {
    const flow = params.data as Flow;

    let requestText = '';
    if (flow.flow?.case === 'httpFlow') {
        const httpFlow = flow.flow.value;
        const url = httpFlow.request?.prettyUrl || httpFlow.request?.url || '';
        const queryIndex = url.indexOf('?');
        const baseUrl = queryIndex !== -1 ? url.substring(0, queryIndex) : url;
        requestText = `${httpFlow.request?.method} ${baseUrl}`;
    } else if (flow.flow?.case === 'dnsFlow') {
        const dnsFlow = flow.flow.value;
        requestText = dnsFlow.request?.questions[0]?.name || '';
    } else if (flow.flow?.case === 'tcpFlow') {
        const tcpFlow = flow.flow.value;
        requestText = `${tcpFlow.server?.addressHost}:${tcpFlow.server?.addressPort}`;
    } else if (flow.flow?.case === 'udpFlow') {
        const udpFlow = flow.flow.value;
        requestText = `${udpFlow.server?.addressHost}:${udpFlow.server?.addressPort}`;
    }

    return (
        <div className="flex items-center gap-2">
            <FlowIcon flow={flow} />
            <span className="truncate">{requestText}</span>
        </div>
    );
};

export const TransferCellRenderer: React.FC<ICellRendererParams> = (params) => {
    const flow = params.data as Flow;
    if (flow.flow?.case === 'httpFlow') {
        const httpFlow = flow.flow.value;
        return (
            <div className="flex flex-col">
                <span>out: {formatBytes(httpFlow.request?.content?.length)}</span>
                <span>in: {formatBytes(httpFlow.response?.content?.length)}</span>
            </div>
        );
    }
    return null;
};

export const DurationCellRenderer: React.FC<ICellRendererParams> = (params) => {
    const flow = params.data as Flow;
    if (flow.flow?.case === 'httpFlow') {
        const httpFlow = flow.flow.value;
        return <span>{formatDuration(httpFlow.durationMs)}</span>;
    }
    return null;
};
