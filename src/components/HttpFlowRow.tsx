import React, { useMemo } from 'react';
import { Flow } from "../gen/mitmflow/v1/mitmflow_pb";
import { getHeader } from '../utils';

const formatUrlWithHostname = (originalUrl: string, sniHostname?: string, hostHeader?: string): string => {
    try {
        const url = new URL(originalUrl);

        // Prioritize SNI, then Host header, then original hostname
        if (sniHostname && sniHostname !== "") {
            url.hostname = sniHostname;
        } else if (hostHeader && hostHeader !== "") {
            // Host header can contain a port, so we need to handle that
            const hostHeaderParts = hostHeader.split(':');
            url.hostname = hostHeaderParts[0];
            if (hostHeaderParts.length > 1) {
                url.port = hostHeaderParts[1];
            }
        }

        // If the port is default for the protocol, remove it for cleaner display
        if ((url.protocol === 'http:' && url.port === '80') || (url.protocol === 'https:' && url.port === '443')) {
            url.port = '';
        }

        return url.toString();
    } catch {
        // If originalUrl is not a valid URL, just return it as is.
        return originalUrl;
    }
};

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

    const statusClass = useMemo(() => {
        if (!httpFlow.response) return 'text-zinc-500';
        if (httpFlow.response.statusCode >= 500) return 'text-red-500 font-bold';
        if (httpFlow.response.statusCode >= 400) return 'text-red-400';
        if (httpFlow.response.statusCode >= 300) return 'text-yellow-400';
        return 'text-green-400';
    }, [httpFlow.response]);

    return (
        <tr
            className={`border-b border-zinc-800 cursor-pointer select-none ${isSelected ? 'bg-orange-900/30 hover:bg-orange-900/40' : 'hover:bg-zinc-800/50'}`}
            onMouseDown={(event) => onMouseDown(flow, event)}
            onMouseEnter={() => onMouseEnter(flow)}
            data-flow-id={httpFlow.id} // Add data-attribute for scrolling
        >
            <td className={`p-3 font-mono max-w-xs overflow-hidden text-ellipsis whitespace-nowrap ${statusClass}`}>{httpFlow.response?.statusCode ?? '...'}</td>
            <td className="p-3 font-mono max-w-xs overflow-hidden text-ellipsis whitespace-nowrap">{httpFlow.request?.method} {formatUrlWithHostname(httpFlow.request?.url || '', httpFlow.client?.sni, getHeader(httpFlow.request?.headers, 'Host'))}</td>
            <td className="hidden md:table-cell p-3 font-mono max-w-xs overflow-hidden text-ellipsis whitespace-nowrap">{httpFlow.response ? `${httpFlow.response.content.length} B` : '...'}</td>
            <td className="hidden md:table-cell p-3 font-mono max-w-xs overflow-hidden text-ellipsis whitespace-nowrap">{httpFlow.durationMs ? `${httpFlow.durationMs.toFixed(0)} ms` : '...'}</td>
        </tr>
    );
};
