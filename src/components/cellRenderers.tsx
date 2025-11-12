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
    if (flow.flow?.case === 'httpFlow') {
        const httpFlow = flow.flow.value;
        return <span>{httpFlow.request?.method} {httpFlow.request?.prettyUrl || httpFlow.request?.url}</span>;
    }
    if (flow.flow?.case === 'dnsFlow') {
        const dnsFlow = flow.flow.value;
        return <span>{dnsFlow.request?.questions[0]?.name}</span>;
    }
    if (flow.flow?.case === 'tcpFlow') {
        const tcpFlow = flow.flow.value;
        return <span>{tcpFlow.server?.addressHost}:{tcpFlow.server?.addressPort}</span>;
    }
    if (flow.flow?.case === 'udpFlow') {
        const udpFlow = flow.flow.value;
        return <span>{udpFlow.server?.addressHost}:{udpFlow.server?.addressPort}</span>;
    }
    return null;
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
