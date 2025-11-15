
import {
    File,
    FileJson,
    FileText,
    FileImage,
    FileCode,
    FileType,
    Network,
    MessageCircle,
    Server,
} from "lucide-react";
import { Flow } from "../gen/mitmproxygrpc/v1/service_pb";
import { getRequestDetails, getResponseDetails } from '../utils';

export default function FlowIcon({ flow }: { flow: Flow }) {
    if (!flow.flow?.case) {
        return null;
    }
    if (flow.flow.case === "httpFlow") {
        const contentType =
            getResponseDetails(flow.flow.value.response)?.effectiveContentType ||
            getRequestDetails(flow.flow.value.request)?.effectiveContentType;

        const iconMap: [string, JSX.Element][] = [
            ["json", <FileJson className="w-5 h-5" />],
            ["xml", <FileCode className="w-5 h-5" />],
            ["text/html", <FileCode className="w-5 h-5" />],
            ["text/css", <FileCode className="w-5 h-5" />],
            ["application/javascript", <FileCode className="w-5 h-5" />],
            ["text", <FileText className="w-5 h-5" />],
            ["font", <FileType className="w-5 h-5" />],
            ["image", <FileImage className="w-5 h-5" />],
            ["dns", <Network className="w-5 h-5" />],
        ];

        if (contentType) {
            for (const [key, icon] of iconMap) {
                if (contentType.includes(key)) {
                    return icon;
                }
            }
        }

        return <File className="w-5 h-5" />;
    } else if (flow.flow.case === "dnsFlow") {
        return <Network className="w-5 h-5" />;
    } else if (flow.flow.case === "tcpFlow") {
        return <Server className="w-5 h-5" />;
    } else if (flow.flow.case === "udpFlow") {
        return <MessageCircle className="w-5 h-5" />;
    } else {
        return null;
    }
}
