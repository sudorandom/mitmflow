import React from 'react';
import { AgGridReact } from 'ag-grid-react';
import { ColDef, ICellRendererParams } from 'ag-grid-community';
import { Flow } from '../gen/mitmflow/v1/mitmflow_pb';
import FlowIcon from './FlowIcon';
import { StatusPill } from './StatusPill';
import { formatBytes, formatDuration } from '../utils';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-alpine.css';

interface FlowGridProps {
    flows: Flow[];
    onRowClicked: (flow: Flow) => void;
}

const FlowIconRenderer: React.FC<ICellRendererParams> = ({ data }) => {
    return <FlowIcon flow={data} />;
};

const StatusRenderer: React.FC<ICellRendererParams> = ({ data }) => {
    if (data.flow.case === 'httpFlow') {
        const httpFlow = data.flow.value;
        const statusCode = httpFlow.response?.statusCode;
        if (statusCode === undefined) {
            return <StatusPill status="..." color="gray" />;
        }
        const statusColor = statusCode >= 500 ? 'red' : statusCode >= 400 ? 'red' : statusCode >= 300 ? 'yellow' : 'green';
        return <StatusPill status={statusCode} color={statusColor} />;
    } else if (data.flow.case === 'dnsFlow') {
        const dnsFlow = data.flow.value;
        const status = dnsFlow.response ? 'OK' : 'ERROR';
        const statusColor = dnsFlow.response ? 'green' : 'red';
        return <StatusPill status={status} color={statusColor} />;
    }
    return null;
};

const RequestRenderer: React.FC<ICellRendererParams> = ({ data }) => {
    if (data.flow.case === 'httpFlow') {
        const httpFlow = data.flow.value;
        return `${httpFlow.request?.method} ${httpFlow.request?.prettyUrl || httpFlow.request?.url}`;
    } else if (data.flow.case === 'dnsFlow') {
        const dnsFlow = data.flow.value;
        return `dns://${dnsFlow.server?.addressHost}`;
    } else if (data.flow.case === 'tcpFlow') {
        const tcpFlow = data.flow.value;
        return `tcp://${tcpFlow.server?.addressHost}:${tcpFlow.server?.addressPort}`;
    } else if (data.flow.case === 'udpFlow') {
        const udpFlow = data.flow.value;
        return `udp://${udpFlow.server?.addressHost}:${udpFlow.server?.addressPort}`;
    }
    return null;
};

const TransferRenderer: React.FC<ICellRendererParams> = ({ data }) => {
    if (data.flow.case === 'httpFlow') {
        const httpFlow = data.flow.value;
        return (
            <div className="flex flex-col">
                <span>out: {formatBytes(httpFlow.request?.content?.length)}</span>
                <span>in: {formatBytes(httpFlow.response?.content?.length)}</span>
            </div>
        );
    } else if (data.flow.case === 'dnsFlow') {
        const dnsFlow = data.flow.value;
        return (
            <div className="flex flex-col">
                <span>out: {formatBytes(dnsFlow.request?.packed?.length)}</span>
                <span>in: {formatBytes(dnsFlow.response?.packed?.length)}</span>
            </div>
        );
    }
    return null;
};

const DurationRenderer: React.FC<ICellRendererParams> = ({ data }) => {
    if (data.flow.case === 'httpFlow' || data.flow.case === 'dnsFlow' || data.flow.case === 'tcpFlow' || data.flow.case === 'udpFlow') {
        return formatDuration(data.flow.value.durationMs);
    }
    return null;
};

const FlowGrid: React.FC<FlowGridProps> = ({ flows, onRowClicked }) => {
    const columnDefs: ColDef[] = [
        { headerName: '', cellRenderer: FlowIconRenderer, width: 50 },
        { headerName: 'Status', cellRenderer: StatusRenderer, width: 100 },
        { headerName: 'Request', cellRenderer: RequestRenderer, flex: 1 },
        { headerName: 'Transfer', cellRenderer: TransferRenderer, width: 150 },
        { headerName: 'Duration', cellRenderer: DurationRenderer, width: 120 },
    ];

    return (
        <div className="ag-theme-alpine-dark" style={{ height: '100%', width: '100%' }} data-testid="flow-grid">
            <AgGridReact
                rowData={flows}
                columnDefs={columnDefs}
                onRowClicked={(event) => onRowClicked(event.data)}
                suppressColumnVirtualisation={process.env.NODE_ENV === 'test'}
            />
        </div>
    );
};

export default FlowGrid;
