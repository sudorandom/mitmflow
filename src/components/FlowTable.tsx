import React, { forwardRef } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { ColDef, GetRowIdParams, RowClickedEvent, ValueGetterParams } from 'ag-grid-community';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-alpine.css';
import { Flow } from '../gen/mitmflow/v1/mitmflow_pb';
import { getFlowId, getFlowTimestampStart, getTimestamp } from '../utils';
import { DurationCellRenderer, InTransferCellRenderer, OutTransferCellRenderer, RequestCellRenderer, StatusCellRenderer, TimestampCellRenderer } from './cellRenderers';

interface FlowTableProps {
    flows: Flow[];
    focusedFlowId: string | null;
    onSelectionChanged: (selectedFlows: Flow[]) => void;
    onRowClicked: (flow: Flow, event: React.MouseEvent) => void;
}

const FlowTable = forwardRef<AgGridReact, FlowTableProps>(
    function FlowTable({ flows, focusedFlowId, onSelectionChanged, onRowClicked }, ref) {
        const columnDefs: ColDef<Flow>[] = [
            { headerName: "", width: 50, headerCheckboxSelection: true, checkboxSelection: true },
            {
                headerName: "Timestamp",
                width: 120,
                cellRenderer: TimestampCellRenderer,
                headerClass: 'text-center',
                cellClass: 'text-center font-mono',
                comparator: (valueA: Flow, valueB: Flow) => {
                    const tsA = getFlowTimestampStart(valueA);
                    const tsB = getFlowTimestampStart(valueB);
                    const msA = tsA ? getTimestamp(tsA) : 0;
                    const msB = tsB ? getTimestamp(tsB) : 0;
                    return msA - msB;
                },
                valueGetter: (params: ValueGetterParams<Flow>) => params.data,
                sortable: true,
            },
            {
                headerName: "Status",
                width: 100,
                cellRenderer: StatusCellRenderer,
                valueGetter: (params: ValueGetterParams<Flow>) => {
                    const flow = params.data;
                    if (!flow) return null;
                    if (flow.flow?.case === 'httpFlow') {
                        return flow.flow.value.response?.statusCode;
                    }
                    return null;
                },
                sortable: true,
            },
            {
                headerName: "Request",
                flex: 1,
                cellRenderer: RequestCellRenderer,
                valueGetter: (params: ValueGetterParams<Flow>) => {
                    const flow = params.data;
                    if (!flow || !flow.flow) return '';
                    switch (flow.flow.case) {
                        case 'httpFlow':
                            const httpFlow = flow.flow.value;
                            const url = (httpFlow.request?.prettyUrl || httpFlow.request?.url) ?? '';
                            const urlWithoutQuery = url.split('?')[0];
                            return `${httpFlow.request?.method} ${urlWithoutQuery}`;
                        case 'dnsFlow':
                            const dnsFlow = flow.flow.value;
                            return dnsFlow.request?.questions[0]?.name || '';
                        case 'tcpFlow':
                            const tcpFlow = flow.flow.value;
                            return `${tcpFlow.server?.addressHost}:${tcpFlow.server?.addressPort}`;
                        case 'udpFlow':
                            const udpFlow = flow.flow.value;
                            return `${udpFlow.server?.addressHost}:${udpFlow.server?.addressPort}`;
                        default:
                            return '';
                    }
                },
                sortable: true,
            },
            {
                headerName: "In",
                width: 100,
                cellRenderer: InTransferCellRenderer,
                valueGetter: (params: ValueGetterParams<Flow>) => {
                    const flow = params.data;
                    if (!flow) return null;
                    if (flow.flow?.case === 'httpFlow') {
                        return flow.flow.value.response?.content?.length;
                    }
                    return null;
                },
                sortable: true,
            },
            {
                headerName: "Out",
                width: 100,
                cellRenderer: OutTransferCellRenderer,
                valueGetter: (params: ValueGetterParams<Flow>) => {
                    const flow = params.data;
                    if (!flow) return null;
                    if (flow.flow?.case === 'httpFlow') {
                        return flow.flow.value.request?.content?.length;
                    }
                    return null;
                },
                sortable: true,
            },
            {
                headerName: "Duration",
                width: 150,
                cellRenderer: DurationCellRenderer,
                valueGetter: (params: ValueGetterParams<Flow>) => {
                    const flow = params.data;
                    if (!flow) return null;
                    if (flow.flow?.case === 'httpFlow') {
                        return flow.flow.value.durationMs;
                    }
                    return null;
                },
                sortable: true,
            },
        ];

        const rowClassRules = {
            'ag-row-focused': (params: any) => params.data && getFlowId(params.data) === focusedFlowId,
        };

        return (
            <div className="ag-theme-alpine-dark" style={{ height: '100%', width: '100%' }}>
                <AgGridReact
                    ref={ref}
                    rowData={flows}
                    columnDefs={columnDefs}
                    rowSelection="multiple"
                    suppressRowClickSelection={true}
                    onSelectionChanged={(event) => onSelectionChanged(event.api.getSelectedRows())}
                    onRowClicked={(e: RowClickedEvent) => onRowClicked(e.data, e.event as unknown as React.MouseEvent)}
                    getRowId={(params: GetRowIdParams<Flow>) => getFlowId(params.data) ?? ''}
                    headerHeight={25}
                    rowClassRules={rowClassRules}
                />
            </div>
        );
    });

FlowTable.displayName = 'FlowTable';

export default FlowTable;
