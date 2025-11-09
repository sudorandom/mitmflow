import React from 'react';
import { Flow } from "../gen/mitmflow/v1/mitmflow_pb";

export const DnsFlowRow: React.FC<{
    flow: Flow;
    isSelected: boolean;
    onMouseDown: (flow: Flow, event: React.MouseEvent) => void;
    onMouseEnter: (flow: Flow) => void;
}> = ({ flow, isSelected, onMouseDown, onMouseEnter }) => {
    const dnsFlow = flow.flow.case === 'dnsFlow' ? flow.flow.value : null;

    if (!dnsFlow) {
        return null;
    }

    const status = dnsFlow.response ? 'OK' : 'ERROR';
    const statusClass = dnsFlow.response ? 'bg-green-700' : 'bg-red-700';

    return (
        <tr
            className={`border-b border-zinc-800 cursor-pointer select-none ${isSelected ? 'bg-orange-900/30 hover:bg-orange-900/40' : 'hover:bg-zinc-800/50'}`}
            onMouseDown={(event) => onMouseDown(flow, event)}
            onMouseEnter={() => onMouseEnter(flow)}
            data-flow-id={dnsFlow.id}
        >
            <td className="p-3 font-mono max-w-xs overflow-hidden text-ellipsis whitespace-nowrap">
                <span className={`rounded-sm px-2 py-1 text-xs text-white ${statusClass}`}>{status}</span>
            </td>
            <td className="p-3 font-mono max-w-xs overflow-hidden text-ellipsis whitespace-nowrap">dns://{dnsFlow.server?.addressHost}</td>
            <td className="hidden md:table-cell p-3 font-mono max-w-xs overflow-hidden text-ellipsis whitespace-nowrap">{dnsFlow.response ? `${dnsFlow.response.packed.length} B` : '...'}</td>
            <td className="hidden md:table-cell p-3 font-mono max-w-xs overflow-hidden text-ellipsis whitespace-nowrap">{dnsFlow.durationMs ? `${dnsFlow.durationMs.toFixed(0)} ms` : '...'}</td>
        </tr>
    );
};
