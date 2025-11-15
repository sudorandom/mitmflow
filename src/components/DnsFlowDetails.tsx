import React, { useState } from 'react';
import { Flow } from "../gen/mitmproxygrpc/v1/service_pb";
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
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm font-mono">
                        <div className="bg-zinc-800 p-4 rounded col-span-2">
                            <h5 className="font-semibold text-zinc-400 mb-3 border-b border-zinc-700 pb-2">DNS Query</h5>
                            <pre className="whitespace-pre-wrap break-all">{dnsFlow.request?.questions.map(q => `${q.name} ${q.type} ${q.class}`).join('\n')}</pre>
                        </div>
                        {dnsFlow.response && (
                            <div className="bg-zinc-800 p-4 rounded col-span-2">
                                <h5 className="font-semibold text-zinc-400 mb-3 border-b border-zinc-700 pb-2">DNS Answers</h5>
                                <pre className="whitespace-pre-wrap break-all">{dnsFlow.response.answers.map(a => `${a.name} ${a.type} ${a.class} ${a.ttl} ${a.data}`).join('\n')}</pre>
                            </div>
                        )}
                        {dnsFlow.error && (
                            <div className="bg-zinc-800 p-4 rounded col-span-2">
                                <h5 className="font-semibold text-red-400 mb-3 border-b border-zinc-700 pb-2">Error</h5>
                                <div className="text-red-400">{dnsFlow.error}</div>
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
