import React from 'react';
import { ClientConn, ServerConn } from "../gen/mitmflow/v1/mitmflow_pb";
import { getTimestamp } from '../utils';
import { TimingRow } from './TimingRow';

interface ConnectionTabProps {
    client?: ClientConn;
    server?: ServerConn;
}

export const ConnectionTab: React.FC<ConnectionTabProps> = ({ client, server }) => {
    const firstTimestamp = getTimestamp(client?.timestampStart);

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm font-mono">
            <div className="bg-zinc-800 p-4 rounded">
                <h5 className="font-semibold text-zinc-400 mb-3 border-b border-zinc-700 pb-2">Client</h5>
                <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                    <div className="text-zinc-500">ID:</div> <div>{client?.id}</div>
                    <div className="text-zinc-500">Address:</div> <div>{client?.peernameHost}:{client?.peernamePort}</div>
                    <div className="text-zinc-500">TLS SNI:</div> <div>{client?.sni}</div>
                    <div className="text-zinc-500">TLS ALPN:</div> <div>{client?.alpn ? new TextDecoder().decode(client.alpn) : 'N/A'}</div>
                    <div className="text-zinc-500">TLS Cipher:</div> <div>{client?.cipher}</div>
                    <div className="text-zinc-500">TLS Version:</div> <div>{client?.tlsVersion}</div>
                </div>
            </div>
            <div className="bg-zinc-800 p-4 rounded">
                <h5 className="font-semibold text-zinc-400 mb-3 border-b border-zinc-700 pb-2">Server</h5>
                <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                    <div className="text-zinc-500">ID:</div> <div>{server?.id}</div>
                    <div className="text-zinc-500">Address:</div> <div>{server?.addressHost}:{server?.addressPort}</div>
                    <div className="text-zinc-500">TLS ALPN:</div> <div>{server?.alpn ? new TextDecoder().decode(server.alpn) : 'N/A'}</div>
                    <div className="text-zinc-500">TLS Cipher:</div> <div>{server?.cipher}</div>
                    <div className="text-zinc-500">TLS Version:</div> <div>{server?.tlsVersion}</div>
                </div>
            </div>
            <div className="bg-zinc-800 p-4 rounded">
                <h5 className="font-semibold text-zinc-400 mb-3 border-b border-zinc-700 pb-2">Timing</h5>
                <div className="grid grid-cols-[max-content,1fr] gap-x-4 gap-y-2">
                    <TimingRow label="Client Start" timestamp={getTimestamp(client?.timestampStart)} relativeTo={firstTimestamp} />
                    <TimingRow label="Client TLS Setup" timestamp={getTimestamp(client?.timestampTlsSetup)} relativeTo={firstTimestamp} />
                    <TimingRow label="Server TCP Setup" timestamp={getTimestamp(server?.timestampTcpSetup)} relativeTo={firstTimestamp} />
                    <TimingRow label="Server TLS Setup" timestamp={getTimestamp(server?.timestampTlsSetup)} relativeTo={firstTimestamp} />
                    <TimingRow label="Client End" timestamp={getTimestamp(client?.timestampEnd)} relativeTo={firstTimestamp} />
                    <TimingRow label="Server End" timestamp={getTimestamp(server?.timestampEnd)} relativeTo={firstTimestamp} />
                </div>
            </div>
        </div>
    );
};
