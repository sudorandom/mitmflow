// src/components/StatusPill.tsx
import React from 'react';

interface StatusPillProps {
    status: string | number;
    color: 'green' | 'red' | 'yellow' | 'gray';
}

export const StatusPill: React.FC<StatusPillProps> = ({ status, color }) => {
    const colorClasses = {
        green: 'bg-green-700 text-white',
        red: 'bg-red-700 text-white',
        yellow: 'bg-yellow-700 text-white',
        gray: 'bg-zinc-700 text-white',
    };

    return (
        <span className={`rounded-sm px-2 py-1 text-xs ${colorClasses[color]}`}>
            {status}
        </span>
    );
};
