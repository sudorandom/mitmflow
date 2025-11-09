import React from 'react';
import { Flow } from '../gen/mitmflow/v1/mitmflow_pb';
import HexViewer from '../HexViewer';

export const UdpFlowDetails: React.FC<{ flow: Flow }> = ({ flow }) => {
    if (flow.flow.case !== 'udpFlow') {
        return null;
    }
    const udpFlow = flow.flow.value;

    return (
        <div className="p-4">
            <h2 className="text-lg font-semibold mb-2">UDP Flow Details</h2>
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <h3 className="font-semibold">Client</h3>
                    <p>Address: {udpFlow.client?.peernameHost}:{udpFlow.client?.peernamePort}</p>
                </div>
                <div>
                    <h3 className="font-semibold">Server</h3>
                    <p>Address: {udpFlow.server?.addressHost}:{udpFlow.server?.addressPort}</p>
                </div>
            </div>
            <div className="mt-4">
                <h3 className="font-semibold">Messages</h3>
                {udpFlow.messages.map((msg, index) => (
                    <div key={index} className="mt-2">
                        <p className="font-semibold">{msg.fromClient ? 'Client -> Server' : 'Server -> Client'}</p>
                        <HexViewer data={msg.content} />
                    </div>
                ))}
            </div>
        </div>
    );
};
