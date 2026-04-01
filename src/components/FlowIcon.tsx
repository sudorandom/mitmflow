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
import { getSummary } from "../utils";

export default function FlowIcon({ flow }: { flow: Flow | FlowSummary }) {
    if (!flow) return null;

    const summary = getSummary(flow as FlowSummary);
    let flowCase = summary.case;

    if (!flowCase && 'flow' in flow && flow.flow?.case) {
        if (flow.flow.case === 'httpFlow') flowCase = 'http';
        else if (flow.flow.case === 'dnsFlow') flowCase = 'dns';
        else if (flow.flow.case === 'tcpFlow') flowCase = 'tcp';
        else if (flow.flow.case === 'udpFlow') flowCase = 'udp';
    }

    if (flowCase === "http") {
        let contentType: string | undefined;
        
        // Try to get content type if it's a full Flow
        if ('flow' in flow && flow.flow?.case === 'httpFlow') {
            contentType =
                flow.httpFlowExtra?.response?.effectiveContentType ||
                flow.httpFlowExtra?.request?.effectiveContentType;
        } else {
            // Check for plain JSON full Flow structure
            const anyFlow = flow as unknown as { 
                httpFlowExtra?: { 
                    response?: { effectiveContentType?: string }, 
                    request?: { effectiveContentType?: string } 
                } 
            };
            contentType = 
                anyFlow.httpFlowExtra?.response?.effectiveContentType ||
                anyFlow.httpFlowExtra?.request?.effectiveContentType;
        }

        if (contentType) {
            const iconMap: [string, JSX.Element][] = [
                ["json", <FileJson key="json" className="w-5 h-5" />],
                ["xml", <FileCode key="xml" className="w-5 h-5" />],
                ["text/html", <FileCode key="html" className="w-5 h-5" />],
                ["text/css", <FileCode key="css" className="w-5 h-5" />],
                ["application/javascript", <FileCode key="js" className="w-5 h-5" />],
                ["text", <FileText key="text" className="w-5 h-5" />],
                ["font", <FileType key="font" className="w-5 h-5" />],
                ["image", <FileImage key="img" className="w-5 h-5" />],
                ["dns", <Network key="dns" className="w-5 h-5" />],
            ];

            for (const [key, icon] of iconMap) {
                if (contentType.includes(key)) {
                    return icon;
                }
            }
        }

        return <File className="w-5 h-5" />;
    } else if (flowCase === "dns") {
        return <Network className="w-5 h-5" />;
    } else if (flowCase === "tcp") {
        return <Server className="w-5 h-5" />;
    } else if (flowCase === "udp") {
        return <MessageCircle className="w-5 h-5" />;
    }

    return null;
}
