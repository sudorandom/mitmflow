import React, { forwardRef, useMemo, useState, useEffect, useRef } from 'react';
import { ColDef, ValueGetterParams } from 'ag-grid-community';
import { Pin, StickyNote } from 'lucide-react';
import { FlowSummary } from '../gen/mitmflow/v1/mitmflow_pb';
import { getFlowId, getFlowTimestampStart, getTimestamp } from '../utils';
import { TableVirtuoso, VirtuosoHandle, TableComponents } from 'react-virtuoso';

import './FlowTable.css';
import { DurationCellRenderer, InTransferCellRenderer, OutTransferCellRenderer, RequestCellRenderer, StatusCellRenderer, TimestampCellRenderer } from './cellRenderers';

interface FlowTableProps {
    flows: FlowSummary[];
    focusedFlowId: string | null;
    selectedFlowIds: Set<string>;
    newFlowIds?: Set<string>;
    onRowSelected: (flow: FlowSummary, options: { event?: React.MouseEvent | React.KeyboardEvent }) => void;
    onToggleRowSelection: (flowId: string) => void;
    onTogglePin: (flow: FlowSummary) => void;
    pinned: boolean | undefined;
    onTogglePinnedFilter: () => void;
}

type CustomColDef = ColDef<FlowSummary> & {
    headerComponent?: () => React.ReactNode;
};

// Context to pass data to custom components (Scroller, TableRow)
interface TableContext {
    focusedFlowId: string | null;
    selectedFlowIds: Set<string>;
    newFlowIds: Set<string> | undefined;
    onRowSelected: (flow: FlowSummary, options: { event?: React.MouseEvent | React.KeyboardEvent }) => void;
    handleTableKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => void;
    parentRef: React.ForwardedRef<HTMLDivElement>;
}

// Scroller component definition matching react-virtuoso expectations
// context is provided by TableVirtuoso to components. It must be strictly typed as TableContext (not optional) to match TableComponents<Data, Context>
const Scroller = forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement> & { context: TableContext }>((props, ref) => {
    // Separate context from other props
    const { context, ...divProps } = props;

    return (
        <div
            {...divProps}
            ref={(node) => {
                // Combine refs: react-virtuoso's ref and the forwarded parentRef
                if (typeof ref === 'function') ref(node);
                else if (ref) (ref as React.MutableRefObject<HTMLDivElement | null>).current = node;

                if (context?.parentRef) {
                     if (typeof context.parentRef === 'function') context.parentRef(node);
                     else (context.parentRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
                }
            }}
            tabIndex={0}
            role="grid"
            aria-activedescendant={context?.focusedFlowId ? `flow-row-${context.focusedFlowId}` : undefined}
            onKeyDown={context?.handleTableKeyDown}
            className={`flex flex-col min-h-0 w-full overflow-auto bg-white dark:bg-zinc-900 ${props.className || ''}`}
        >
            {props.children}
        </div>
    );
});
Scroller.displayName = 'Scroller';

const Table = forwardRef<HTMLTableElement, React.TableHTMLAttributes<HTMLTableElement>>((props, ref) => (
    <table
        {...props}
        ref={ref}
        className="w-full text-sm flex-shrink-0 text-gray-900 dark:text-zinc-300"
        style={{ ...props.style, borderCollapse: 'collapse' }}
    />
));
Table.displayName = 'Table';

const TableHead = forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>((props, ref) => (
    <thead {...props} ref={ref} className="sticky top-0 z-10 bg-white dark:bg-zinc-900" />
));
TableHead.displayName = 'TableHead';

// TableRow component definition matching react-virtuoso expectations
const TableRow = forwardRef<HTMLTableRowElement, { item: FlowSummary; context: TableContext; 'data-index': number } & React.HTMLAttributes<HTMLTableRowElement>>(({ item: flow, context, ...props }, ref) => {
    const idx = props['data-index'];
    const flowId = getFlowId(flow);
    const isFocused = flowId && context.focusedFlowId === flowId;
    const isSelected = flowId && context.selectedFlowIds.has(flowId);
    const isNew = flowId && context.newFlowIds?.has(flowId);

    // Alternating row color: even rows darker
    const baseRow = idx % 2 === 0 ? 'bg-white dark:bg-zinc-900' : 'bg-gray-50 dark:bg-zinc-800';

    // Selection and Focus styles
    let rowClass = `cursor-pointer border-b border-gray-200 dark:border-zinc-700 ${baseRow}`;

    if (isNew) {
        rowClass += ' new-flow-highlight';
    }

    if (isFocused) {
        rowClass = `cursor-pointer border-2 border-orange-500 ${baseRow} bg-orange-50 dark:bg-orange-950/30`;
    }

    if (isSelected) {
        const selectedBg = 'bg-orange-100 dark:bg-zinc-700';
        if (isFocused) {
            rowClass = `cursor-pointer border-2 border-orange-500 bg-orange-100 dark:bg-zinc-700`;
        } else {
            rowClass = `cursor-pointer border-b border-gray-200 dark:border-zinc-700 ${selectedBg}`;
        }
    }

    return (
        <tr
            {...props}
            ref={ref}
            id={flowId ? `flow-row-${flowId}` : undefined}
            data-flow-id={flowId}
            tabIndex={-1}
            role="row"
            className={rowClass}
            onClick={e => {
                context.onRowSelected(flow, { event: e as React.MouseEvent });
            }}
        >
            {props.children}
        </tr>
    );
});
TableRow.displayName = 'TableRow';

const VirtuosoTableComponents: TableComponents<FlowSummary, TableContext> = {
    Scroller: Scroller,
    Table: Table,
    TableHead: TableHead,
    TableRow: TableRow,
};

const FlowTable = forwardRef<HTMLDivElement, FlowTableProps>(
    function FlowTable({ flows, focusedFlowId, selectedFlowIds, newFlowIds, onRowSelected, onToggleRowSelection, onTogglePin, pinned, onTogglePinnedFilter }, ref) {
        // Sort config: track column index (in columnDefs) and direction
        const [sortConfig, setSortConfig] = useState<{ colIndex: number | null; direction: 'asc' | 'desc' }>({ colIndex: 2, direction: 'desc' }); // default sort by Timestamp desc
        const virtuosoRef = useRef<VirtuosoHandle>(null);

        // Selection header checkbox ref to set indeterminate state
        const selectAllRef = useRef<HTMLInputElement | null>(null);

        const columnDefs: CustomColDef[] = [
            { headerName: "", width: 40, headerCheckboxSelection: true, checkboxSelection: true },
            {
                headerName: "",
                width: 40,
                headerComponent: () => (
                    <button
                        onClick={onTogglePinnedFilter}
                        className={`p-1 rounded hover:bg-gray-200 dark:hover:bg-zinc-700 ${pinned === true ? 'text-orange-500' : 'text-gray-500 dark:text-zinc-500'}`}
                        title={pinned === true ? "Show not pinned flows" : (pinned === false ? "Show all flows" : "Show only pinned flows")}
                    >
                        <Pin size={14} className={pinned === true ? "fill-current" : ""} />
                    </button>
                ),
                cellRenderer: (params: { data: FlowSummary }) => (
                    <div className="flex items-center justify-center gap-1">
                        <button
                            onClick={(e) => { e.stopPropagation(); onTogglePin(params.data); }}
                            className={`p-1 rounded hover:bg-gray-200 dark:hover:bg-zinc-700 ${params.data.pinned ? 'text-orange-500' : 'text-gray-500 dark:text-zinc-500'}`}
                            title={params.data.pinned ? "Unpin flow" : "Pin flow"}
                        >
                            <Pin size={14} className={params.data.pinned ? "fill-current" : ""} />
                        </button>
                        {params.data.note && (
                            <span title="This flow has a note" className="text-blue-500">
                                <StickyNote size={12} className="fill-current" />
                            </span>
                        )}
                    </div>
                ),
                cellClass: 'text-center',
            },
            {
                headerName: "Timestamp",
                width: 120,
                cellRenderer: TimestampCellRenderer,
                headerClass: 'text-center',
                cellClass: 'text-center font-mono',
                comparator: (valueA: FlowSummary, valueB: FlowSummary) => {
                    const tsA = getFlowTimestampStart(valueA);
                    const tsB = getFlowTimestampStart(valueB);
                    const msA = tsA ? getTimestamp(tsA) : 0;
                    const msB = tsB ? getTimestamp(tsB) : 0;
                    return msA - msB;
                },
                valueGetter: (params: ValueGetterParams<FlowSummary>) => params.data,
                sortable: true,
            },
            {
                headerName: "Status",
                width: 100,
                cellRenderer: StatusCellRenderer,
                valueGetter: (params: ValueGetterParams<FlowSummary>) => {
                    const flow = params.data;
                    if (!flow) return null;
                    if (flow.summary.case === 'http') {
                        return flow.summary.value.statusCode;
                    }
                    return null;
                },
                sortable: true,
            },
            {
                headerName: "Request",
                flex: 1,
                cellRenderer: RequestCellRenderer,
                valueGetter: (params: ValueGetterParams<FlowSummary>) => {
                    const flow = params.data;
                    if (!flow || !flow.summary.case) return '';
                    switch (flow.summary.case) {
                        case 'http':
                            const http = flow.summary.value;
                            return `${http.method} ${http.url.split('?')[0]}`;
                        case 'dns':
                            return flow.summary.value.questionName;
                        case 'tcp':
                            return `${flow.summary.value.serverAddressHost}:${flow.summary.value.serverAddressPort}`;
                        case 'udp':
                            return `${flow.summary.value.serverAddressHost}:${flow.summary.value.serverAddressPort}`;
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
                valueGetter: (params: ValueGetterParams<FlowSummary>) => {
                    const flow = params.data;
                    if (!flow) return null;
                    if (flow.summary.case === 'http') {
                        return flow.summary.value.requestContentLength;
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
                valueGetter: (params: ValueGetterParams<FlowSummary>) => {
                    const flow = params.data;
                    if (!flow) return null;
                    if (flow.summary.case === 'http') {
                        return flow.summary.value.responseContentLength;
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
                valueGetter: (params: ValueGetterParams<FlowSummary>) => {
                    const flow = params.data;
                    if (!flow) return null;
                    if (flow.summary.case === 'http') {
                        return flow.summary.value.durationMs;
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
                    const valueGetter = col.valueGetter as ((p: ValueGetterParams<FlowSummary>) => unknown) | undefined;
                    const va = valueGetter ? valueGetter({ data: a } as ValueGetterParams<FlowSummary>) : a;
                    const vb = valueGetter ? valueGetter({ data: b } as ValueGetterParams<FlowSummary>) : b;
                    const customComparator = col.comparator as (valueA: unknown, valueB: unknown, nodeA?: unknown, nodeB?: unknown, isInverted?: boolean) => number;
                    return directionFactor * customComparator(va, vb);
                }
                if (typeof col.valueGetter === 'function') {
                    const va = col.valueGetter({ data: a } as ValueGetterParams<FlowSummary>);
                    const vb = col.valueGetter({ data: b } as ValueGetterParams<FlowSummary>);
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
                    // Scroll to item using Virtuoso
                    virtuosoRef.current?.scrollToIndex({ index: nextIndex, align: 'center' });
                }
            }
        };

        const context = useMemo<TableContext>(() => ({
            focusedFlowId,
            selectedFlowIds,
            newFlowIds,
            onRowSelected,
            handleTableKeyDown,
            parentRef: ref,
        }), [focusedFlowId, selectedFlowIds, newFlowIds, onRowSelected, handleTableKeyDown, ref]);

        const fixedHeaderContent = () => (
             <tr>
                {columnDefs.map((col, i) => {
                    const headerBaseClass = "px-2 py-1 bg-gray-100 dark:bg-zinc-900 text-gray-700 dark:text-zinc-400 font-semibold border-b border-gray-200 dark:border-zinc-700";

                    if (i === 0) {
                        return (
                            <th key={i} style={{ width: col.width }} className={`${headerBaseClass} text-center`}>
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
                    const content = col.headerComponent ? (
                        col.headerComponent()
                    ) : (
                        <span className="inline-flex items-center gap-1">
                            {col.headerName}
                            {isSorted && (
                                <span aria-hidden="true">{direction === 'asc' ? '▲' : '▼'}</span>
                            )}
                        </span>
                    );
                    return (
                        <th
                            key={i}
                            className={`${col.headerClass || ''} ${headerBaseClass} cursor-pointer select-none`}
                            style={{ width: col.width, textAlign: 'left' }}
                            onClick={() => !col.headerComponent && handleHeaderSortClick(i)}
                            aria-sort={isSorted ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'}
                        >
                            {content}
                        </th>
                    );
                })}
            </tr>
        );

        const itemContent = (_index: number, flow: FlowSummary) => {
            const flowId = getFlowId(flow);
            const isSelected = flowId && selectedFlowIds.has(flowId);

            return (
                <>
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
                            ? (col.cellRenderer as (params: { data: FlowSummary }) => React.ReactNode)({ data: flow })
                            : (typeof col.valueGetter === 'function'
                                ? col.valueGetter({ data: flow } as ValueGetterParams<FlowSummary>)
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
                </>
            );
        };

        return (
            <TableVirtuoso
                ref={virtuosoRef}
                style={{ height: '100%', width: '100%' }}
                data={sortedFlows}
                components={VirtuosoTableComponents}
                context={context}
                fixedHeaderContent={fixedHeaderContent}
                itemContent={itemContent}
            />
        );
    });

FlowTable.displayName = 'FlowTable';

export default FlowTable;
