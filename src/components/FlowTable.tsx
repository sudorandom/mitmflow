import React, { forwardRef } from 'react';
import { AgGridReact, RowClickedEvent } from 'ag-grid-react';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-alpine.css';
import { Flow } from '../gen/mitmflow/v1/mitmflow_pb';
import { getFlowId } from '../utils';
import { DurationCellRenderer, RequestCellRenderer, StatusCellRenderer, TransferCellRenderer } from './cellRenderers';

interface FlowTableProps {
    flows: Flow[];
    onSelectionChanged: (selectedFlows: Flow[]) => void;
    onRowClicked: (event: RowClickedEvent) => void;
}

const FlowTable = forwardRef<AgGridReact, FlowTableProps>(
    function FlowTable({ flows, onSelectionChanged, onRowClicked }, ref) {
        const columnDefs = [
            { headerName: "", width: 50, headerCheckboxSelection: true, checkboxSelection: true },
            { headerName: "Status", field: "status", width: 100, cellRenderer: StatusCellRenderer },
            { headerName: "Request", field: "request", flex: 1, cellRenderer: RequestCellRenderer },
            { headerName: "Transfer", field: "transfer", width: 150, cellRenderer: TransferCellRenderer },
            { headerName: "Duration", field: "duration", width: 150, cellRenderer: DurationCellRenderer },
        ];

        return (
            <div className="ag-theme-alpine-dark" style={{ height: '100%', width: '100%' }}>
                <AgGridReact
                    ref={ref}
                    rowData={flows}
                    columnDefs={columnDefs}
                    rowSelection="multiple"
                    suppressRowClickSelection={true}
                    onSelectionChanged={(event) => onSelectionChanged(event.api.getSelectedRows())}
                    onRowClicked={onRowClicked}
                    getRowId={(params) => getFlowId(params.data)}
                />
            </div>
        );
    });

FlowTable.displayName = 'FlowTable';

export default FlowTable;
