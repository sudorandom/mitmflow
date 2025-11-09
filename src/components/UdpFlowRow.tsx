import React from 'react';
import { Flow } from '../gen/mitmflow/v1/mitmflow_pb';
import { getFlowId, getTimestamp, formatDuration, formatSize } from '../utils';

export const UdpFlowRow: React.FC<{
    flow: Flow;
    isSelected: boolean;
    onMouseDown: (flow: Flow, event: React.MouseEvent) => void;
    onMouseEnter: (flow: Flow) => void;
}> = ({ flow, isSelected, onMouseDown, onMouseEnter }) => {
    if (flow.flow.case !== 'udpFlow') {
        return null;
    }
    const udpFlow = flow.flow.value;
    const flowId = getFlowId(flow);
    const timestamp = getTimestamp(udpFlow.timestampStart);
    const duration = udpFlow.durationMs;
    const size = udpFlow.messages.reduce((acc, msg) => acc + msg.content.length, 0);
    const status = udpFlow.error ? 'ERROR' : 'OK';

    return (
        <tr
            key={flowId}
            data-flow-id={flowId}
            className={`cursor-pointer ${isSelected ? 'bg-zinc-700' : 'hover:bg-zinc-800'}`}
            onMouseDown={(e) => onMouseDown(flow, e)}
            onMouseEnter={() => onMouseEnter(flow)}
        >
            <td className="p-3 border-b border-zinc-700">
                <span className={`px-2 py-1 text-xs font-semibold rounded-full ${udpFlow.error ? 'bg-red-900 text-red-300' : 'bg-green-900 text-green-300'}`}>
                    {status}
                </span>
            </td>
            <td className="p-3 border-b border-zinc-700">
                <div className="flex items-center gap-2">
                    <span className="font-mono text-sm text-zinc-400">udp://{udpFlow.server?.addressHost}:{udpFlow.server?.addressPort}</span>
                </div>
                <div className="text-xs text-zinc-500">{new Date(timestamp).toLocaleTimeString()}</div>
            </td>
            <td className="hidden md:table-cell p-3 border-b border-zinc-700">{formatSize(size)}</td>
            <td className="hidden md:table-cell p-3 border-b border-zinc-700">{formatDuration(duration)}</td>
        </tr>
    );
};
