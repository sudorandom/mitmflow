import {
  flexRender,
  getCoreRowModel,
  getFacetedMinMaxValues,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import React from 'react';
import { columns } from '../columns';
import { Flow } from '../gen/mitmflow/v1/mitmflow_pb';
import { ColumnFilter } from './ColumnFilter';

interface FlowsTableProps {
  flows: Flow[];
  onRowClick: (flow: Flow, event?: React.MouseEvent) => void;
  onRowMouseEnter: (flow: Flow) => void;
  selectedFlowIds: Set<string>;
  getFlowId: (flow: Flow) => string | undefined;
  globalFilter: string;
  setGlobalFilter: (filter: string) => void;
}

export const FlowsTable: React.FC<FlowsTableProps> = ({
  flows,
  onRowClick,
  onRowMouseEnter,
  selectedFlowIds,
  getFlowId,
  globalFilter,
  setGlobalFilter,
}) => {
  const [columnFilters, setColumnFilters] = React.useState<any[]>([]);

  const table = useReactTable({
    data: flows,
    columns,
    state: {
      columnFilters,
      globalFilter,
    },
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
    getFacetedMinMaxValues: getFacetedMinMaxValues(),
  });

  const { rows } = table.getRowModel();
  const parentRef = React.useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 35,
    overscan: 20,
  });

  return (
    <div ref={parentRef} className="h-full overflow-auto">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-zinc-800 z-10">
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <th
                  key={header.id}
                  className="p-2 text-left font-medium text-zinc-400 border-b border-zinc-700"
                >
                  {header.isPlaceholder ? null : (
                    <>
                      <div
                        {...{
                          className: header.column.getCanSort()
                            ? 'cursor-pointer select-none'
                            : '',
                          onClick: header.column.getToggleSortingHandler(),
                        }}
                      >
                        {flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                        {{
                          asc: ' 🔼',
                          desc: ' 🔽',
                        }[header.column.getIsSorted() as string] ?? null}
                      </div>
                      {header.column.getCanFilter() ? (
                        <div>
                          <ColumnFilter
                            column={header.column}
                            table={table}
                          />
                        </div>
                      ) : null}
                    </>
                  )}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            position: 'relative',
          }}
        >
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const row = rows[virtualRow.index];
            const flowId = getFlowId(row.original);
            const isSelected = flowId ? selectedFlowIds.has(flowId) : false;
            return (
              <tr
                key={row.id}
                data-testid={`flow-row-${flowId}`}
                data-index={virtualRow.index}
                ref={(node) => virtualizer.measureElement(node)}
                style={{
                  position: 'absolute',
                  transform: `translateY(${virtualRow.start}px)`,
                  width: '100%',
                }}
                className={`cursor-pointer ${
                  isSelected ? 'bg-orange-900/50' : 'hover:bg-zinc-800/50'
                }`}
                onMouseDown={(e) => onRowClick(row.original, e)}
                onMouseEnter={() => onRowMouseEnter(row.original)}
              >
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="p-2 border-b border-zinc-700">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
