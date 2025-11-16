import React from 'react';
import {
    ClientConn,
    ServerConn,
    ConnectionState,
    TLSVersion,
    TransportProtocol
} from "../gen/mitmproxygrpc/v1/service_pb";
import { getTimestamp } from '../utils';
import { TimingRow } from './TimingRow';
import { CertificateDetails } from "./CertificateDetails";

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
                    <div className="text-zinc-500">State:</div> <div>{client ? ConnectionState[client.state] : 'N/A'}</div>
                    <div className="text-zinc-500">Protocol:</div> <div>{client ? TransportProtocol[client.transportProtocol] : 'N/A'}</div>
                    <div className="text-zinc-500">Error:</div> <div>{client?.error ?? 'N/A'}</div>
                    <div className="text-zinc-500">TLS:</div> <div>{client?.tls ? "✅" : "❌"}</div>
                    <div className="text-zinc-500">TLS SNI:</div> <div>{client?.sni}</div>
                    <div className="text-zinc-500">TLS ALPN:</div> <div>{client?.alpn ? new TextDecoder().decode(client.alpn) : 'N/A'}</div>
                    <div className="text-zinc-500">TLS ALPN Offers:</div> <div>{client?.alpnOffers.map(offer => new TextDecoder().decode(offer)).join(', ') || 'N/A'}</div>
                    <div className="text-zinc-500">TLS Cipher:</div> <div>{client?.cipher}</div>
                    <div className="text-zinc-500">TLS Cipher List:</div> <div>{client?.cipherList.join(', ') || 'N/A'}</div>
                    <div className="text-zinc-500">TLS Version:</div> <div>{client?.tlsVersion ? TLSVersion[client.tlsVersion] : 'N/A'}</div>
                </div>
                {client?.certificateList.map((cert, i) => <CertificateDetails key={i} cert={cert} />)}
            </div>
            <div className="bg-zinc-800 p-4 rounded">
                <h5 className="font-semibold text-zinc-400 mb-3 border-b border-zinc-700 pb-2">Server</h5>
                <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                    <div className="text-zinc-500">ID:</div> <div>{server?.id}</div>
                    <div className="text-zinc-500">Address:</div> <div>{server?.addressHost}:{server?.addressPort}</div>
                    <div className="text-zinc-500">State:</div> <div>{server ? ConnectionState[server.state] : 'N/A'}</div>
                    <div className="text-zinc-500">Protocol:</div> <div>{server ? TransportProtocol[server.transportProtocol] : 'N/A'}</div>
                    <div className="text-zinc-500">Error:</div> <div>{server?.error ?? 'N/A'}</div>
                    <div className="text-zinc-500">TLS:</div> <div>{server?.tls ? "✅" : "❌"}</div>
                    <div className="text-zinc-500">TLS ALPN:</div> <div>{server?.alpn ? new TextDecoder().decode(server.alpn) : 'N/A'}</div>
                    <div className="text-zinc-500">TLS ALPN Offers:</div> <div>{server?.alpnOffers.map(offer => new TextDecoder().decode(offer)).join(', ') || 'N/A'}</div>
                    <div className="text-zinc-500">TLS Cipher:</div> <div>{server?.cipher}</div>
                    <div className="text-zinc-500">TLS Cipher List:</div> <div>{server?.cipherList.join(', ') || 'N/A'}</div>
                    <div className="text-zinc-500">TLS Version:</div> <div>{server?.tlsVersion ? TLSVersion[server.tlsVersion] : 'N/A'}</div>
                </div>
                {server?.certificateList.map((cert, i) => <CertificateDetails key={i} cert={cert} />)}
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
