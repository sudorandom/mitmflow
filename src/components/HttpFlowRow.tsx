import React, { useMemo } from 'react';
import { Flow } from "../gen/mitmflow/v1/mitmflow_pb";
import { formatSize } from '../utils';
import FlowIcon from './FlowIcon';
import { StatusPill } from './StatusPill';
import { formatDuration } from '../utils';

export const HttpFlowRow: React.FC<{
    flow: Flow;
    isSelected: boolean;
    onMouseDown: (flow: Flow, event: React.MouseEvent) => void;
    onMouseEnter: (flow: Flow) => void;
}> = ({ flow: flow, isSelected, onMouseDown, onMouseEnter }) => {
    if (!flow || !flow.flow || flow.flow.case !== 'httpFlow') {
        // For now, we only render HTTP flows.
        return null;
    }
    const httpFlow = flow.flow.value;

    const statusColor = useMemo(() => {
        if (!httpFlow.response) return 'gray';
        if (httpFlow.response.statusCode >= 500) return 'red';
        if (httpFlow.response.statusCode >= 400) return 'red';
        if (httpFlow.response.statusCode >= 300) return 'yellow';
        return 'green';
    }, [httpFlow.response]);

    return (
        <tr
            className={`border-b border-zinc-800 cursor-pointer select-none ${isSelected ? 'bg-orange-900/30 hover:bg-orange-900/40' : 'hover:bg-zinc-800/50'}`}
            onMouseDown={(event) => onMouseDown(flow, event)}
            onMouseEnter={() => onMouseEnter(flow)}
            data-flow-id={httpFlow.id} // Add data-attribute for scrolling
        >
            <td className="p-3"><FlowIcon flow={flow} /></td>
            <td className="p-3 font-mono max-w-xs overflow-hidden text-ellipsis whitespace-nowrap">
                <StatusPill status={httpFlow.response?.statusCode ?? '...'} color={statusColor} />
            </td>
            <td className="p-3 font-mono max-w-xs overflow-hidden text-ellipsis whitespace-nowrap">{httpFlow.request?.method} {httpFlow.request?.prettyUrl || httpFlow.request?.url}</td>
            <td className="hidden md:table-cell p-3 font-mono max-w-xs overflow-hidden text-ellipsis whitespace-nowrap">{httpFlow.response ? `${formatSize(httpFlow.response.content.length)}` : '...'}</td>
            <td className="hidden md:table-cell p-3 font-mono max-w-xs overflow-hidden text-ellipsis whitespace-nowrap">{formatDuration(httpFlow.durationMs)}</td>
        </tr>
    );
};
