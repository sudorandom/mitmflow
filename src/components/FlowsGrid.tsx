import React, { useMemo, useCallback } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { ColDef, GetRowIdParams, SelectionChangedEvent } from 'ag-grid-community';
import { Flow } from '../gen/mitmflow/v1/mitmflow_pb';
import { getFlowType, getRequest, getResponse, formatBytes, getFlowId } from '../utils';
import FlowIcon from './FlowIcon';
import { StatusPill } from './StatusPill';

import 'ag-grid-community/styles/ag-grid.css';
import "ag-grid-community/styles/ag-theme-quartz.css";

interface FlowsGridProps {
    flows: Flow[];
    onSelectionChanged: (selectedFlows: Flow[]) => void;
    onGridReady: (api: any) => void;
}

export const FlowsGrid: React.FC<FlowsGridProps> = ({ flows, onSelectionChanged, onGridReady }) => {
    const columnDefs = useMemo<ColDef[]>(() => [
        {
            headerName: '',
            checkboxSelection: true,
            headerCheckboxSelection: true,
            width: 50,
        },
        {
            field: 'type',
            headerName: '',
            valueGetter: (params) => getFlowType(params.data),
            cellRenderer: (params) => <FlowIcon flow={params.data} />,
            width: 50,
        },
        {
            field: 'status',
            headerName: 'Status',
            valueGetter: (params) => getResponse(params.data)?.statusCode,
            cellRenderer: (params) => <StatusPill flow={params.data} />,
            filter: 'agNumberColumnFilter',
            width: 100,
        },
        {
            field: 'request',
            headerName: 'Request',
            valueGetter: (params) => {
                const request = getRequest(params.data);
                return request?.prettyUrl || request?.url || '';
            },
            cellRenderer: (params) => {
                const flow = params.data;
                const request = getRequest(flow);
                const flowType = getFlowType(flow);

                switch (flowType) {
                    case 'http':
                        return (
                            <div className="flex items-center gap-2 min-w-0">
                                <span className="font-mono text-xs bg-zinc-700 text-zinc-300 rounded px-1.5 py-0.5">
                                    {request?.method}
                                </span>
                                <span className="truncate">{request?.prettyUrl}</span>
                            </div>
                        );
                    case 'dns':
                        return <span className="truncate">dns://{request?.questions?.[0]?.name}</span>;
                    case 'tcp':
                        return <span className="truncate">tcp://{flow.flow.value?.server?.addressHost}:{flow.flow.value?.server?.addressPort}</span>;
                    case 'udp':
                        return <span className="truncate">udp://{flow.flow.value?.server?.addressHost}:{flow.flow.value?.server?.addressPort}</span>;
                    default:
                        return null;
                }
            },
            filter: 'agTextColumnFilter',
        },
        {
            field: 'transfer',
            headerName: 'Transfer',
            valueGetter: (params) => getResponse(params.data)?.content?.length || 0,
            cellRenderer: (params) => formatBytes(params.value),
            filter: 'agNumberColumnFilter',
            width: 120,
        },
        {
            field: 'duration',
            headerName: 'Duration',
            valueGetter: (params) => params.data.flow.value?.durationMs,
            cellRenderer: (params) => params.value ? `${params.value} ms` : '-',
            filter: 'agNumberColumnFilter',
            width: 120,
        },
    ], []);

    const getRowId = useMemo(() => {
        return (params: GetRowIdParams<Flow>) => getFlowId(params.data) || '';
    }, []);

    const handleSelectionChanged = useCallback((event: SelectionChangedEvent) => {
        onSelectionChanged(event.api.getSelectedRows());
    }, [onSelectionChanged]);

    return (
        <div className="ag-theme-quartz-dark h-full">
            <AgGridReact
                rowData={flows}
                columnDefs={columnDefs}
                onGridReady={onGridReady}
                rowSelection="multiple"
                animateRows={true}
                getRowId={getRowId}
                onSelectionChanged={handleSelectionChanged}
            />
        </div>
    );
};
