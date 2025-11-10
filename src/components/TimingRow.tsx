import React from 'react';
import { formatTimestampWithRelative } from '../utils';

export const TimingRow: React.FC<{ label: string; timestamp?: number; relativeTo: number }> = ({ label, timestamp, relativeTo }) => {
    if (!timestamp) return null;
    return (
        <>
            <div className="text-zinc-500">{label}:</div>
            <div>{formatTimestampWithRelative(timestamp, relativeTo)}</div>
        </>
    );
};
