import React from 'react';
import { Cert } from "../gen/mitmproxygrpc/v1/service_pb";
import { getTimestamp, formatDateTime } from '../utils';

interface CertificateDetailsProps {
    cert: Cert;
}

export const CertificateDetails: React.FC<CertificateDetailsProps> = ({ cert }) => {
    return (
        <div className="bg-gray-50 dark:bg-zinc-800 p-4 rounded mb-4 mt-4 border border-gray-200 dark:border-zinc-700">
            <h6 className="font-semibold text-gray-700 dark:text-zinc-400 mb-3 border-b border-gray-200 dark:border-zinc-700 pb-2">Certificate</h6>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-gray-900 dark:text-zinc-300">
                <div className="text-gray-500 dark:text-zinc-500">Subject CN:</div> <div>{cert.cn}</div>
                <div className="text-gray-500 dark:text-zinc-500">Subject Org:</div> <div>{cert.organization}</div>
                <div className="text-gray-500 dark:text-zinc-500">Issuer:</div> <div>{Object.entries(cert.issuers).map(([k, v]) => `${k}=${v}`).join(', ')}</div>
                <div className="text-gray-500 dark:text-zinc-500">Not Before:</div> <div>{formatDateTime(getTimestamp(cert.notbefore))}</div>
                <div className="text-gray-500 dark:text-zinc-500">Not After:</div> <div>{formatDateTime(getTimestamp(cert.notafter))}</div>
                <div className="text-gray-500 dark:text-zinc-500">Expired:</div> <div>{cert.hasexpired ? 'Yes' : 'No'}</div>
                <div className="text-gray-500 dark:text-zinc-500">Alt Names:</div> <div>{cert.altnames.join(', ')}</div>
                <div className="text-gray-500 dark:text-zinc-500">Serial:</div> <div>{cert.serial}</div>
                <div className="text-gray-500 dark:text-zinc-500">Is CA:</div> <div>{cert.isCa ? 'Yes' : 'No'}</div>
            </div>
        </div>
    );
};
