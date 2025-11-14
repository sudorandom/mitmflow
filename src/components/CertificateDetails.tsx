import React from 'react';
import { Cert } from "../gen/mitmflow/v1/mitmflow_pb";
import { getTimestamp, formatDateTime } from '../utils';

interface CertificateDetailsProps {
    cert: Cert;
}

export const CertificateDetails: React.FC<CertificateDetailsProps> = ({ cert }) => {
    return (
        <div className="bg-zinc-800 p-4 rounded mb-4">
            <h6 className="font-semibold text-zinc-400 mb-3 border-b border-zinc-700 pb-2">Certificate</h6>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                <div className="text-zinc-500">Subject CN:</div> <div>{cert.cn}</div>
                <div className="text-zinc-500">Subject Org:</div> <div>{cert.organization}</div>
                <div className="text-zinc-500">Issuer:</div> <div>{Object.entries(cert.issuers).map(([k, v]) => `${k}=${v}`).join(', ')}</div>
                <div className="text-zinc-500">Not Before:</div> <div>{formatDateTime(getTimestamp(cert.notbefore))}</div>
                <div className="text-zinc-500">Not After:</div> <div>{formatDateTime(getTimestamp(cert.notafter))}</div>
                <div className="text-zinc-500">Expired:</div> <div>{cert.hasexpired ? 'Yes' : 'No'}</div>
                <div className="text-zinc-500">Alt Names:</div> <div>{cert.altnames.join(', ')}</div>
                <div className="text-zinc-500">Serial:</div> <div>{cert.serial}</div>
                <div className="text-zinc-500">Is CA:</div> <div>{cert.isCa ? 'Yes' : 'No'}</div>
            </div>
        </div>
    );
};