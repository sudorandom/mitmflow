
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
import { Flow, FlowSummary } from "../gen/mitmflow/v1/mitmflow_pb";

export default function FlowIcon({ flow }: { flow: Flow | FlowSummary }) {
    const isFullFlow = 'flow' in flow && flow.flow;
    const isSummaryFlow = 'summary' in flow && flow.summary;

    if (!isFullFlow && !isSummaryFlow) {
        return null;
    }

    if (isFullFlow) {
        const fullFlow = flow as Flow;
        if (fullFlow.flow.case === "httpFlow") {
            const contentType =
                fullFlow.httpFlowExtra?.response?.effectiveContentType ||
                fullFlow.httpFlowExtra?.request?.effectiveContentType;

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
        } else if (fullFlow.flow.case === "dnsFlow") {
            return <Network className="w-5 h-5" />;
        } else if (fullFlow.flow.case === "tcpFlow") {
            return <Server className="w-5 h-5" />;
        } else if (fullFlow.flow.case === "udpFlow") {
            return <MessageCircle className="w-5 h-5" />;
        }
    } else if (isSummaryFlow) {
        const summaryFlow = flow as FlowSummary;
        if (summaryFlow.summary.case === "http") {
            return <File className="w-5 h-5" />; // Summaries don't have content type yet
        } else if (summaryFlow.summary.case === "dns") {
            return <Network className="w-5 h-5" />;
        } else if (summaryFlow.summary.case === "tcp") {
            return <Server className="w-5 h-5" />;
        } else if (summaryFlow.summary.case === "udp") {
            return <MessageCircle className="w-5 h-5" />;
        }
    }

    return null;
}
