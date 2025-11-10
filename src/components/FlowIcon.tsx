
import {
    FileJson,
    FileText,
    FileImage,
    FileCode,
    Globe,
    Network,
    MessageCircle,
    Server,
} from "lucide-react";
import { Flow } from "@/gen/mitmflow/v1/mitmflow_pb";

export default function FlowIcon({ flow }: { flow: Flow }) {
    if (flow.flow.case === "httpFlow") {
        const contentType = flow.flow.value.response?.headers["content-type"];

        if (contentType?.includes("json")) {
            return <FileJson className="w-5 h-5" />;
        } else if (contentType?.includes("text/html")) {
            return <FileCode className="w-5 h-5" />;
        } else if (contentType?.includes("text/")) {
            return <FileText className="w-5 h-5" />;
        } else if (contentType?.includes("image/")) {
            return <FileImage className="w-5 h-5" />;
        } else {
            return <Globe className="w-5 h-5" />;
        }
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
