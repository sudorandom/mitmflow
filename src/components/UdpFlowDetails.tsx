import React, { useState } from 'react';
import { Flow } from '../gen/mitmproxygrpc/v1/service_pb';
import HexViewer from '../HexViewer';
import { ConnectionTab } from './ConnectionTab';

export const UdpFlowDetails: React.FC<{ flow: Flow }> = ({ flow }) => {
    const [selectedTab, setSelectedTab] = useState<'summary' | 'connection'>('summary');

    if (flow.flow.case !== 'udpFlow') {
        return null;
    }
    const udpFlow = flow.flow.value;

    return (
        <>
            <div className="flex-shrink-0 border-b border-zinc-700">
                <div className="flex items-center px-4">
                    <button
                        className={`px-3 py-2 text-sm font-medium border-b-2 ${selectedTab === 'summary' ? 'border-orange-500 text-orange-500' : 'border-transparent text-zinc-400 hover:text-white'}`}
                        onClick={() => setSelectedTab('summary')}
                    >
                        Summary
                    </button>
                    <button
                        className={`px-3 py-2 text-sm font-medium border-b-2 ${selectedTab === 'connection' ? 'border-orange-500 text-orange-500' : 'border-transparent text-zinc-400 hover:text-white'}`}
                        onClick={() => setSelectedTab('connection')}
                    >
                        Connection
                    </button>
                </div>
            </div>
            <div className="p-5 overflow-y-auto flex-grow">
                {selectedTab === 'summary' && (
                    <div>
                        <h3 className="font-semibold">Messages</h3>
                        {udpFlow.messages.map((msg, index) => (
                            <div key={index} className="mt-2">
                                <p className="font-semibold">{msg.fromClient ? 'Client -> Server' : 'Server -> Client'}</p>
                                <HexViewer data={msg.content} />
                            </div>
                        ))}
                    </div>
                )}
                {selectedTab === 'connection' && (
                    <ConnectionTab client={udpFlow.client} server={udpFlow.server} />
                )}
            </div>
        </>
    );
};
