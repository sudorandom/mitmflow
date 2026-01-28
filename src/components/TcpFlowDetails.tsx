import React, { useState } from 'react';
import { Flow } from '../gen/mitmflow/v1/mitmflow_pb';
import HexViewer from '../HexViewer';
import { ConnectionTab } from './ConnectionTab';
import { StickyNote } from 'lucide-react';

export const TcpFlowDetails: React.FC<{ flow: Flow }> = ({ flow }) => {
    const [selectedTab, setSelectedTab] = useState<'summary' | 'connection'>('summary');

    if (flow.flow.case !== 'tcpFlow') {
        return null;
    }
    const tcpFlow = flow.flow.value;

    return (
        <>
            <div className="sticky top-0 bg-white dark:bg-zinc-900 z-10 flex-shrink-0 border-b border-gray-200 dark:border-zinc-700">
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
                        {flow.note && (
                            <div className="bg-yellow-50 dark:bg-yellow-950/30 p-4 rounded border border-yellow-200 dark:border-yellow-900/50 mb-4">
                                <h5 className="font-semibold text-yellow-700 dark:text-yellow-400 mb-2 flex items-center gap-2">
                                    <StickyNote size={16} /> Note
                                </h5>
                                <div className="text-gray-800 dark:text-zinc-200 whitespace-pre-wrap font-sans">{flow.note}</div>
                            </div>
                        )}
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
