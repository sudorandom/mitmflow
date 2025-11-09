import React from 'react';
import { Flow } from '../gen/mitmflow/v1/mitmflow_pb';
import HexViewer from '../HexViewer';

export const TcpFlowDetails: React.FC<{ flow: Flow }> = ({ flow }) => {
    if (flow.flow.case !== 'tcpFlow') {
        return null;
    }
    const tcpFlow = flow.flow.value;

    return (
        <div className="p-4">
            <h2 className="text-lg font-semibold mb-2">TCP Flow Details</h2>
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <h3 className="font-semibold">Client</h3>
                    <p>Address: {tcpFlow.client?.peernameHost}:{tcpFlow.client?.peernamePort}</p>
                </div>
                <div>
                    <h3 className="font-semibold">Server</h3>
                    <p>Address: {tcpFlow.server?.addressHost}:{tcpFlow.server?.addressPort}</p>
                </div>
            </div>
            <div className="mt-4">
                <h3 className="font-semibold">Messages</h3>
                {tcpFlow.messages.map((msg, index) => (
                    <div key={index} className="mt-2">
                        <p className="font-semibold">{msg.fromClient ? 'Client -> Server' : 'Server -> Client'}</p>
                        <HexViewer data={msg.content} />
                    </div>
                ))}
            </div>
        </div>
    );
};
