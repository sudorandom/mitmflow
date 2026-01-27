import React, { useState } from 'react';
import { Flow } from "../gen/mitmflow/v1/mitmflow_pb";
import { ConnectionTab } from './ConnectionTab';

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
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm font-mono">
                        <div className="bg-gray-50 dark:bg-zinc-800 p-4 rounded col-span-2 border border-gray-200 dark:border-zinc-700">
                            <h5 className="font-semibold text-gray-700 dark:text-zinc-400 mb-3 border-b border-gray-200 dark:border-zinc-700 pb-2">DNS Query</h5>
                            <pre className="whitespace-pre-wrap break-all text-gray-800 dark:text-zinc-300">{dnsFlow.request?.questions.map(q => `${q.name} ${q.type} ${q.class}`).join('\n')}</pre>
                        </div>
                        {dnsFlow.response && (
                            <div className="bg-gray-50 dark:bg-zinc-800 p-4 rounded col-span-2 border border-gray-200 dark:border-zinc-700">
                                <h5 className="font-semibold text-gray-700 dark:text-zinc-400 mb-3 border-b border-gray-200 dark:border-zinc-700 pb-2">DNS Answers</h5>
                                <pre className="whitespace-pre-wrap break-all text-gray-800 dark:text-zinc-300">{dnsFlow.response.answers.map(a => `${a.name} ${a.type} ${a.class} ${a.ttl} ${a.data}`).join('\n')}</pre>
                            </div>
                        )}
                        {dnsFlow.error && (
                            <div className="bg-red-50 dark:bg-zinc-800 p-4 rounded col-span-2 border border-red-200 dark:border-zinc-700">
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
