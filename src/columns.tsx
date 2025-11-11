import { createColumnHelper } from '@tanstack/react-table';
import { Flow } from './gen/mitmflow/v1/mitmflow_pb';
import {
  formatBytes,
  getFlowId,
  getFlowType,
  getRequest,
  getResponse,
  getTimestamp,
} from './utils';
import FlowIcon from './components/FlowIcon';
import { StatusPill } from './components/StatusPill';
import { ColumnFilter } from './components/ColumnFilter';

const columnHelper = createColumnHelper<Flow>();

export const columns = [
  columnHelper.accessor((row) => getFlowType(row), {
    id: 'type',
    header: () => null,
    cell: (info) => <FlowIcon flow={info.row.original} />,
  }),
  columnHelper.accessor(
    (row) => {
      const response = getResponse(row);
      return response?.statusCode;
    },
    {
      id: 'status',
      header: () => <span>Status</span>,
      cell: (info) => <StatusPill flow={info.row.original} />,
    }
  ),
  columnHelper.accessor(
    (row) => {
      const request = getRequest(row);
      return request?.prettyUrl || request?.url || '';
    },
    {
      id: 'request',
      header: () => <span>Request</span>,
      cell: (info) => {
        const flow = info.row.original;
        const request = getRequest(flow);
        const flowType = getFlowType(flow);

        switch (flowType) {
          case 'http':
            return (
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs bg-zinc-700 text-zinc-300 rounded px-1.5 py-0.5">
                  {request?.method}
                </span>
                <span className="truncate">{request?.prettyUrl}</span>
              </div>
            );
          case 'dns':
            return (
              <span className="truncate">
                dns://{request?.questions?.[0]?.name}
              </span>
            );
          case 'tcp':
            return (
              <span className="truncate">
                tcp://{flow.flow.value?.server?.addressHost}:
                {flow.flow.value?.server?.addressPort}
              </span>
            );
          case 'udp':
            return (
              <span className="truncate">
                udp://{flow.flow.value?.server?.addressHost}:
                {flow.flow.value?.server?.addressPort}
              </span>
            );
          default:
            return null;
        }
      },
      filterFn: 'includesString',
    }
  ),
  columnHelper.accessor(
    (row) => {
      const response = getResponse(row);
      return response?.content?.length || 0;
    },
    {
      id: 'transfer',
      header: () => <span>Transfer</span>,
      cell: (info) => formatBytes(info.getValue() as number),
      filterFn: 'inNumberRange',
    }
  ),
  columnHelper.accessor(
    (row) => {
      return row.flow.value?.durationMs;
    },
    {
      id: 'duration',
      header: () => <span>Duration</span>,
      cell: (info) => {
        const duration = info.getValue() as number;
        return duration ? `${duration} ms` : '-';
      },
      filterFn: 'inNumberRange',
    }
  ),
];
