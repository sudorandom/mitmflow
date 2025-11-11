// src/components/StatusPill.tsx
import React from 'react';
import { Flow } from '../gen/mitmflow/v1/mitmflow_pb';
import { getResponse } from '../utils';

interface StatusPillProps {
    flow: Flow;
}

export const StatusPill: React.FC<StatusPillProps> = ({ flow }) => {
    const response = getResponse(flow);
    const statusCode = response?.statusCode;

    let color: 'green' | 'red' | 'yellow' | 'gray' = 'gray';
    if (statusCode) {
        if (statusCode >= 200 && statusCode < 300) {
            color = 'green';
        } else if (statusCode >= 300 && statusCode < 400) {
            color = 'yellow';
        } else if (statusCode >= 400) {
            color = 'red';
        }
    }

    const colorClasses = {
        green: 'bg-green-700 text-white',
        red: 'bg-red-700 text-white',
        yellow: 'bg-yellow-700 text-white',
        gray: 'bg-zinc-700 text-white',
    };

    return (
        <span className={`rounded-sm px-2 py-1 text-xs ${colorClasses[color]}`}>
            {statusCode || '-'}
        </span>
    );
};
