import React from 'react';
import { ClientConn, ServerConn } from "../gen/mitmflow/v1/mitmflow_pb";
import { formatTimestamp, getTimestamp } from '../utils';

interface ConnectionTabProps {
    client?: ClientConn;
    server?: ServerConn;
}

export const ConnectionTab: React.FC<ConnectionTabProps> = ({ client, server }) => {
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
                <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                    <div className="text-zinc-500">Client Start:</div> <div>{formatTimestamp(getTimestamp(client?.timestampStart))}</div>
                    <div className="text-zinc-500">Client TLS Setup:</div> <div>{formatTimestamp(getTimestamp(client?.timestampTlsSetup))}</div>
                    <div className="text-zinc-500">Server TCP Setup:</div> <div>{formatTimestamp(getTimestamp(server?.timestampTcpSetup))}</div>
                    <div className="text-zinc-500">Server TLS Setup:</div> <div>{formatTimestamp(getTimestamp(server?.timestampTlsSetup))}</div>
                    <div className="text-zinc-500">Client End:</div> <div>{formatTimestamp(getTimestamp(client?.timestampEnd))}</div>
                    <div className="text-zinc-500">Server End:</div> <div>{formatTimestamp(getTimestamp(server?.timestampEnd))}</div>
                </div>
            </div>
        </div>
    );
};
