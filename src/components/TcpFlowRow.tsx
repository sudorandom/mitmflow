import React from 'react';
import { Flow } from '../gen/mitmflow/v1/mitmflow_pb';
import { getFlowId, formatDuration, formatBytes } from '../utils';
import FlowIcon from './FlowIcon';
import { StatusPill } from './StatusPill';

export const TcpFlowRow: React.FC<{
    flow: Flow;
    isSelected: boolean;
    onMouseDown: (flow: Flow, event: React.MouseEvent) => void;
    onMouseEnter: (flow: Flow) => void;
}> = ({ flow, isSelected, onMouseDown, onMouseEnter }) => {
    if (flow.flow.case !== 'tcpFlow') {
        return null;
    }
    const tcpFlow = flow.flow.value;
    const flowId = getFlowId(flow);
    const duration = tcpFlow.durationMs;
    const outSize = tcpFlow.messages.filter(m => m.fromClient).reduce((acc, msg) => acc + msg.content.length, 0);
    const inSize = tcpFlow.messages.filter(m => !m.fromClient).reduce((acc, msg) => acc + msg.content.length, 0);
    const status = tcpFlow.error ? 'ERROR' : 'OK';
    const statusColor = tcpFlow.error ? 'red' : 'green';

    return (
        <tr
            key={flowId}
            data-flow-id={flowId}
            className={`border-b border-zinc-800 cursor-pointer select-none ${isSelected ? 'bg-orange-900/30 hover:bg-orange-900/40' : 'hover:bg-zinc-800/50'}`}
            onMouseDown={(e) => onMouseDown(flow, e)}
            onMouseEnter={() => onMouseEnter(flow)}
        >
            <td className="p-3"><FlowIcon flow={flow} /></td>
            <td className="p-3 font-mono max-w-xs overflow-hidden text-ellipsis whitespace-nowrap">
                <StatusPill status={status} color={statusColor} />
            </td>
            <td className="p-3 font-mono max-w-xs overflow-hidden text-ellipsis whitespace-nowrap">
                tcp://{tcpFlow.server?.addressHost}:{tcpFlow.server?.addressPort}
            </td>
            <td className="hidden md:table-cell p-3 font-mono max-w-xs overflow-hidden text-ellipsis whitespace-nowrap">
                <div className="flex flex-col">
                    <span>out: {formatBytes(outSize)}</span>
                    <span>in: {formatBytes(inSize)}</span>
                </div>
            </td>
            <td className="hidden md:table-cell p-3 font-mono max-w-xs overflow-hidden text-ellipsis whitespace-nowrap">{formatDuration(duration)}</td>
        </tr>
    );
};
