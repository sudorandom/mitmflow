import React from 'react';
import { AgGridReact } from 'ag-grid-react';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-alpine.css';
import { Flow } from '../gen/mitmflow/v1/mitmflow_pb';
import { DurationCellRenderer, IconCellRenderer, RequestCellRenderer, StatusCellRenderer, TransferCellRenderer } from './cellRenderers';

interface FlowTableProps {
    flows: Flow[];
    onSelectionChanged: (selectedFlows: Flow[]) => void;
    onRowClicked: (flow: Flow) => void;
}

const FlowTable: React.FC<FlowTableProps> = ({ flows, onSelectionChanged, onRowClicked }) => {
    const columnDefs = [
        { headerName: "", field: "checkbox", width: 50, headerCheckboxSelection: true, checkboxSelection: true },
        { headerName: "", field: "icon", width: 50, cellRenderer: IconCellRenderer },
        { headerName: "Status", field: "status", width: 100, cellRenderer: StatusCellRenderer },
        { headerName: "Request", field: "request", flex: 1, cellRenderer: RequestCellRenderer },
        { headerName: "Transfer", field: "transfer", width: 150, cellRenderer: TransferCellRenderer },
        { headerName: "Duration", field: "duration", width: 150, cellRenderer: DurationCellRenderer },
    ];

    return (
        <div className="ag-theme-alpine-dark" style={{ height: '100%', width: '100%' }}>
            <AgGridReact
                rowData={flows}
                columnDefs={columnDefs}
                rowSelection="multiple"
                suppressRowClickSelection={true}
                onSelectionChanged={(event) => onSelectionChanged(event.api.getSelectedRows())}
                onRowClicked={(event) => onRowClicked(event.data)}
            />
        </div>
    );
};

export default FlowTable;
