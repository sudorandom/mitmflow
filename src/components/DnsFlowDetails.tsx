import React from 'react';
import { Flow } from "../gen/mitmflow/v1/mitmflow_pb";

export const DnsFlowDetails: React.FC<{
    flow: Flow;
}> = ({ flow }) => {
    const dnsFlow = flow.flow.case === 'dnsFlow' ? flow.flow.value : null;

    if (!dnsFlow) {
        return null;
    }

    return (
        <div className="p-5 overflow-y-auto flex-grow">
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
        </div>
    );
};
