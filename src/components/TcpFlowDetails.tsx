import React, { useState } from 'react';
import { Flow } from '../gen/mitmflow/v1/mitmflow_pb';
import HexViewer from '../HexViewer';
import { ConnectionTab } from './ConnectionTab';

export const TcpFlowDetails: React.FC<{ flow: Flow }> = ({ flow }) => {
    const [selectedTab, setSelectedTab] = useState<'summary' | 'connection'>('summary');

    if (flow.flow.case !== 'tcpFlow') {
        return null;
    }
    const tcpFlow = flow.flow.value;

    return (
        <>
            <div className="flex-shrink-0 border-b border-gray-200 dark:border-zinc-700">
                <div className="flex items-center px-4">
                    <button
                        className={`px-3 py-2 text-sm font-medium border-b-2 ${selectedTab === 'summary' ? 'border-orange-500 text-orange-500' : 'border-transparent text-gray-500 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white'}`}
                        onClick={() => setSelectedTab('summary')}
                    >
                        Summary
                    </button>
                    <button
                        className={`px-3 py-2 text-sm font-medium border-b-2 ${selectedTab === 'connection' ? 'border-orange-500 text-orange-500' : 'border-transparent text-gray-500 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white'}`}
                        onClick={() => setSelectedTab('connection')}
                    >
                        Connection
                    </button>
                </div>
            </div>
            <div className="p-5 overflow-y-auto flex-grow text-gray-900 dark:text-zinc-300">
                {selectedTab === 'summary' && (
                    <div>
                        <h3 className="font-semibold text-gray-900 dark:text-white">Messages</h3>
                        {tcpFlow.messages.map((msg, index) => (
                            <div key={index} className="mt-2">
                                <p className="font-semibold text-gray-800 dark:text-zinc-200">{msg.fromClient ? 'Client -> Server' : 'Server -> Client'}</p>
                                <HexViewer data={msg.content} />
                            </div>
                        ))}
                    </div>
                )}
                {selectedTab === 'connection' && (
                    <ConnectionTab client={tcpFlow.client} server={tcpFlow.server} />
                )}
            </div>
        </>
    );
};
