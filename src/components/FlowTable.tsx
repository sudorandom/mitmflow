import React, { forwardRef, useMemo, useState, useEffect, useRef } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { ColDef, ValueGetterParams } from 'ag-grid-community';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-alpine.css';
import { Flow } from '../gen/mitmflow/v1/mitmflow_pb';
import { getFlowId, getFlowTimestampStart, getTimestamp } from '../utils';

import './FlowTable.css';
import { DurationCellRenderer, InTransferCellRenderer, OutTransferCellRenderer, RequestCellRenderer, StatusCellRenderer, TimestampCellRenderer } from './cellRenderers';

interface FlowTableProps {
    flows: Flow[];
    focusedFlowId: string | null;
    selectedFlowIds: Set<string>;
    onRowSelected: (flow: Flow, options: { event?: React.MouseEvent | React.KeyboardEvent }) => void;
    onToggleRowSelection: (flowId: string) => void;
}

const FlowTable = forwardRef<AgGridReact, FlowTableProps>(
    function FlowTable({ flows, focusedFlowId, selectedFlowIds, onRowSelected, onToggleRowSelection }, ref) {
        // Sort config: track column index (in columnDefs) and direction
        const [sortConfig, setSortConfig] = useState<{ colIndex: number | null; direction: 'asc' | 'desc' }>({ colIndex: 1, direction: 'desc' }); // default sort by Timestamp desc

        // Selection header checkbox ref to set indeterminate state
        const selectAllRef = useRef<HTMLInputElement | null>(null);

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
                headerName: "Out",
                width: 100,
                cellRenderer: OutTransferCellRenderer,
                cellClass: 'nowrap-cell',
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
                headerName: "In",
                width: 100,
                cellRenderer: InTransferCellRenderer,
                cellClass: 'nowrap-cell',
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
                headerName: "Duration",
                width: 150,
                cellRenderer: DurationCellRenderer,
                cellClass: 'nowrap-cell',
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

        // Compute sorted flows based on current sort configuration
        const sortedFlows = useMemo(() => {
            if (!sortConfig.colIndex && sortConfig.colIndex !== 0) return flows;
            const col = columnDefs[sortConfig.colIndex];
            const directionFactor = sortConfig.direction === 'asc' ? 1 : -1;
            const data = [...flows];
            data.sort((a, b) => {
                if (col.comparator) {
                    // Use valueGetter to supply values to comparator when defined, else pass raw flows.
                    const valueGetter = col.valueGetter as ((p: ValueGetterParams<Flow>) => unknown) | undefined;
                    const va = valueGetter ? valueGetter({ data: a } as ValueGetterParams<Flow>) : a;
                    const vb = valueGetter ? valueGetter({ data: b } as ValueGetterParams<Flow>) : b;
                    const customComparator = col.comparator as (valueA: unknown, valueB: unknown, nodeA?: unknown, nodeB?: unknown, isInverted?: boolean) => number;
                    return directionFactor * customComparator(va, vb);
                }
                if (typeof col.valueGetter === 'function') {
                    const va = col.valueGetter({ data: a } as ValueGetterParams<Flow>);
                    const vb = col.valueGetter({ data: b } as ValueGetterParams<Flow>);
                    if (va == null && vb == null) return 0;
                    if (va == null) return -1 * directionFactor;
                    if (vb == null) return 1 * directionFactor;
                    if (typeof va === 'number' && typeof vb === 'number') {
                        return directionFactor * (va - vb);
                    }
                    return directionFactor * String(va).localeCompare(String(vb));
                }
                return 0;
            });
            return data;
        }, [flows, sortConfig]);

        // Determine selection states for visible (sorted) flows
        const allVisibleSelected = sortedFlows.length > 0 && sortedFlows.every(f => {
            const id = getFlowId(f);
            return id ? selectedFlowIds.has(id) : false;
        });
        const someVisibleSelected = sortedFlows.some(f => {
            const id = getFlowId(f);
            return id ? selectedFlowIds.has(id) : false;
        });

        // Set indeterminate state
        useEffect(() => {
            if (selectAllRef.current) {
                selectAllRef.current.indeterminate = someVisibleSelected && !allVisibleSelected;
            }
        }, [someVisibleSelected, allVisibleSelected]);

        const handleHeaderSortClick = (index: number) => {
            if (index === 0) return; // selection column not sortable
            setSortConfig(prev => {
                if (prev.colIndex === index) {
                    return { colIndex: index, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
                }
                return { colIndex: index, direction: 'asc' };
            });
        };

        const handleSelectAllVisible = () => {
            if (allVisibleSelected) {
                // Deselect all visible
                sortedFlows.forEach(flow => {
                    const id = getFlowId(flow);
                    if (id && selectedFlowIds.has(id)) onToggleRowSelection(id);
                });
            } else {
                // Select all visible
                sortedFlows.forEach(flow => {
                    const id = getFlowId(flow);
                    if (id && !selectedFlowIds.has(id)) onToggleRowSelection(id);
                });
            }
        };

        const handleTableKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
            if ((e.target as HTMLElement).id === 'filter-input') return;

            const isNavigationKey = ['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown'].includes(e.key);
            const isSelectionKey = ['Enter', ' '].includes(e.key);
            const isSelectAllKey = (e.metaKey || e.ctrlKey) && e.key === 'a';

            if (isSelectAllKey) {
                e.preventDefault();
                handleSelectAllVisible();
                return;
            }

            if (isSelectionKey && focusedFlowId) {
                e.preventDefault();
                onToggleRowSelection(focusedFlowId);
                return;
            }

            if (!isNavigationKey) {
                return;
            }
            e.preventDefault();

            if (!sortedFlows.length) return;

            let currentIndex = -1;
            if (focusedFlowId) {
                currentIndex = sortedFlows.findIndex(f => getFlowId(f) === focusedFlowId);
            }
            let nextIndex = -1;

            if (e.key === 'ArrowDown') {
                nextIndex = Math.min(currentIndex + 1, sortedFlows.length - 1);
                if (currentIndex === -1) nextIndex = 0;
            } else if (e.key === 'ArrowUp') {
                nextIndex = Math.max(currentIndex - 1, 0);
                if (currentIndex === -1) nextIndex = 0;
            } else if (e.key === 'PageDown') {
                nextIndex = Math.min(currentIndex + 10, sortedFlows.length - 1);
                if (currentIndex === -1) nextIndex = 0;
            } else if (e.key === 'PageUp') {
                nextIndex = Math.max(currentIndex - 10, 0);
                if (currentIndex === -1) nextIndex = 0;
            }

            if (nextIndex !== currentIndex && nextIndex > -1) {
                const nextFlow = sortedFlows[nextIndex];
                if (nextFlow) {
                    onRowSelected(nextFlow, { event: e });
                    const nextFlowId = getFlowId(nextFlow);
                    const rowElement = nextFlowId ? document.querySelector(`[data-flow-id="${nextFlowId}"]`) : null;
                    rowElement?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                }
            }
        };
        return (
            <div
                className="ag-theme-alpine-dark flex flex-col min-h-0 w-full overflow-auto"
                tabIndex={0}
                role="grid"
                aria-activedescendant={focusedFlowId ? `flow-row-${focusedFlowId}` : undefined}
                onKeyDown={handleTableKeyDown}
                ref={ref as React.RefObject<HTMLDivElement>}
            >
                <table className="w-full text-sm flex-shrink-0">
                    <thead>
                        <tr>
                            {columnDefs.map((col, i) => {
                                if (i === 0) {
                                    return (
                                        <th key={i} style={{ width: col.width }} className="text-center">
                                            <input
                                                ref={selectAllRef}
                                                type="checkbox"
                                                checked={allVisibleSelected}
                                                onChange={handleSelectAllVisible}
                                                aria-label="Select/Deselect all visible flows"
                                            />
                                        </th>
                                    );
                                }
                                const isSorted = sortConfig.colIndex === i;
                                const direction = isSorted ? sortConfig.direction : undefined;
                                return (
                                    <th
                                        key={i}
                                        className={`${col.headerClass || ''} cursor-pointer select-none`}
                                        style={{ width: col.width, textAlign: 'left' }}
                                        onClick={() => handleHeaderSortClick(i)}
                                        aria-sort={isSorted ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'}
                                    >
                                        <span className="inline-flex items-center gap-1">
                                            {col.headerName}
                                            {isSorted && (
                                                <span aria-hidden="true">{direction === 'asc' ? '▲' : '▼'}</span>
                                            )}
                                        </span>
                                    </th>
                                );
                            })}
                        </tr>
                    </thead>
                    <tbody>
                        {sortedFlows.map((flow, idx) => {
                            const flowId = getFlowId(flow);
                            const isFocused = flowId && focusedFlowId === flowId;
                            const isSelected = flowId && selectedFlowIds.has(flowId);
                            // Alternating row color: even rows darker
                            const baseRow = idx % 2 === 0 ? 'bg-zinc-900' : 'bg-zinc-800';
                            // Focused row: orange border (all sides), remove default border-b
                            const rowClass = isFocused
                                ? `cursor-pointer border-2 border-orange-500 ${baseRow} bg-orange-950 ${isSelected ? 'bg-zinc-700' : ''}`
                                : `cursor-pointer border-b border-zinc-700 ${baseRow} ${isSelected ? 'bg-zinc-700' : ''}`;
                            return (
                                <tr
                                    key={flowId}
                                    id={flowId ? `flow-row-${flowId}` : undefined}
                                    data-flow-id={flowId}
                                    tabIndex={-1}
                                    role="row"
                                    className={rowClass}
                                    onClick={e => {
                                        onRowSelected(flow, { event: e as React.MouseEvent });
                                    }}
                                >
                                    {/* Checkbox cell */}
                                    <td className="text-center px-2 py-1">
                                        <input
                                            type="checkbox"
                                            checked={!!isSelected}
                                            onChange={() => flowId && onToggleRowSelection(flowId)}
                                            tabIndex={-1}
                                            aria-label="Select row"
                                        />
                                    </td>
                                    {/* Render other columns */}
                                    {columnDefs.slice(1).map((col, i) => {
                                        const content: React.ReactNode = col.cellRenderer && typeof col.cellRenderer === 'function'
                                            ? (col.cellRenderer as (params: { data: Flow }) => React.ReactNode)({ data: flow })
                                            : (typeof col.valueGetter === 'function'
                                                ? col.valueGetter({ data: flow } as ValueGetterParams<Flow>)
                                                : null);
                                        return (
                                            <td
                                                key={i}
                                                className={`${col.cellClass || ''} px-2 py-1`}
                                                role="gridcell"
                                            >
                                                {content}
                                            </td>
                                        );
                                    })}
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        );
    });

FlowTable.displayName = 'FlowTable';

export default FlowTable;
