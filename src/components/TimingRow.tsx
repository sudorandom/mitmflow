import React from 'react';
import { formatTimestampWithRelative } from '../utils';

export const TimingRow: React.FC<{ label: string; timestamp?: number; relativeTo: number }> = ({ label, timestamp, relativeTo }) => {
    if (!timestamp) return null;
    return (
        <>
            <div className="text-gray-500 dark:text-zinc-500">{label}:</div>
            <div className="text-gray-900 dark:text-zinc-300">{formatTimestampWithRelative(timestamp, relativeTo)}</div>
        </>
    );
};
