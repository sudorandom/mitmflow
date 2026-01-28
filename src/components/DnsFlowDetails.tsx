import React, { useState } from 'react';
import { Flow } from "../gen/mitmflow/v1/mitmflow_pb";
import { ConnectionTab } from './ConnectionTab';
import { StickyNote } from 'lucide-react';

export const DnsFlowDetails: React.FC<{
    flow: Flow;
}> = ({ flow }) => {
    const dnsFlow = flow.flow.case === 'dnsFlow' ? flow.flow.value : null;
    const [selectedTab, setSelectedTab] = useState<'summary' | 'connection'>('summary');

    if (!dnsFlow) {
        return null;
    }

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
                    <div className="columns-1 md:columns-2 gap-4 text-sm font-mono space-y-4">
                        {flow.note && (
                            <div className="break-inside-avoid bg-yellow-50 dark:bg-yellow-950/30 p-4 rounded border border-yellow-200 dark:border-yellow-900/50 mb-4">
                                <h5 className="font-semibold text-yellow-700 dark:text-yellow-400 mb-2 flex items-center gap-2">
                                    <StickyNote size={16} /> Note
                                </h5>
                                <div className="text-gray-800 dark:text-zinc-200 whitespace-pre-wrap font-sans">{flow.note}</div>
                            </div>
                        )}
                        <div className="break-inside-avoid bg-gray-50 dark:bg-zinc-800 p-4 rounded border border-gray-200 dark:border-zinc-700">
                            <h5 className="font-semibold text-gray-700 dark:text-zinc-400 mb-3 border-b border-gray-200 dark:border-zinc-700 pb-2">DNS Query</h5>
                            <pre className="whitespace-pre-wrap break-all text-gray-800 dark:text-zinc-300">{dnsFlow.request?.questions.map(q => `${q.name} ${q.type} ${q.class}`).join('\n')}</pre>
                        </div>
                        {dnsFlow.response && (
                            <div className="break-inside-avoid bg-gray-50 dark:bg-zinc-800 p-4 rounded border border-gray-200 dark:border-zinc-700">
                                <h5 className="font-semibold text-gray-700 dark:text-zinc-400 mb-3 border-b border-gray-200 dark:border-zinc-700 pb-2">DNS Answers</h5>
                                <pre className="whitespace-pre-wrap break-all text-gray-800 dark:text-zinc-300">{dnsFlow.response.answers.map(a => `${a.name} ${a.type} ${a.class} ${a.ttl} ${a.data}`).join('\n')}</pre>
                            </div>
                        )}
                        {dnsFlow.error && (
                            <div className="break-inside-avoid bg-red-50 dark:bg-zinc-800 p-4 rounded border border-red-200 dark:border-zinc-700">
                                <h5 className="font-semibold text-red-600 dark:text-red-400 mb-3 border-b border-red-200 dark:border-zinc-700 pb-2">Error</h5>
                                <div className="text-red-600 dark:text-red-400">{dnsFlow.error}</div>
                            </div>
                        )}
                    </div>
                )}
                {selectedTab === 'connection' && (
                    <ConnectionTab client={dnsFlow.client} server={dnsFlow.server} />
                )}
            </div>
        </>
    );
};
