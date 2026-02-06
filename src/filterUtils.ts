import { Flow } from "./gen/mitmflow/v1/mitmflow_pb";
import { FlowType } from "./store";

const textDecoder = new TextDecoder();
const decodedCache = new WeakMap<Uint8Array, string>();

function getDecodedContent(content: Uint8Array): string {
    let text = decodedCache.get(content);
    if (text === undefined) {
        text = textDecoder.decode(content).toLowerCase();
        decodedCache.set(content, text);
    }
    return text;
}

export interface FilterConfig {
  text: string;
  pinnedOnly: boolean;
  hasNote: boolean;
  flowTypes: FlowType[];
  http: {
    methods: string[];
    contentTypes: string[];
    statusCodes: string[];
  };
}

export const isFlowMatch = (flow: Flow, filter: FilterConfig): boolean => {
  if (!flow.flow) return false;

  if (filter.pinnedOnly && !flow.pinned) {
    return false;
  }

  if (filter.hasNote && !flow.note) {
    return false;
  }

  const filterText = filter.text.toLowerCase();

  // --- General Text Filter ---
  if (filterText) {
    let isMatch = false;
    const clientIp = flow.flow.value?.client?.peernameHost || '';
    const serverIp = flow.flow.value?.server?.addressHost || '';
    const note = flow.note || '';

    // Check common fields
    const commonMatch = `${clientIp} ${serverIp} ${note}`.toLowerCase().includes(filterText);
    if (commonMatch) {
        isMatch = true;
    } else {
        switch (flow.flow.case) {
            case 'httpFlow':
                const httpFlow = flow.flow.value;
                const url = httpFlow.request?.prettyUrl || httpFlow.request?.url || '';
                const sni = httpFlow.client?.sni || '';
                const method = httpFlow.request?.method || '';
                const statusCode = httpFlow.response?.statusCode || '';

                const metaText = `${url} ${method} ${statusCode} ${sni}`.toLowerCase();
                if (metaText.includes(filterText)) {
                    isMatch = true;
                } else {
                    // Body check
                    try {
                        // Check textual frames first as they are already decoded and formatted (e.g. gRPC)
                        if (flow.httpFlowExtra?.request?.textualFrames?.some(f => f.toLowerCase().includes(filterText))) {
                            isMatch = true;
                        } else if (flow.httpFlowExtra?.response?.textualFrames?.some(f => f.toLowerCase().includes(filterText))) {
                            isMatch = true;
                        }

                        // Regular body check
                        if (!isMatch && httpFlow.request?.content && httpFlow.request.content.length > 0) {
                            const reqBody = getDecodedContent(httpFlow.request.content);
                            if (reqBody.includes(filterText)) isMatch = true;
                        }
                        if (!isMatch && httpFlow.response?.content && httpFlow.response.content.length > 0) {
                            const resBody = getDecodedContent(httpFlow.response.content);
                            if (resBody.includes(filterText)) isMatch = true;
                        }

                        // WebSocket messages
                        if (!isMatch && httpFlow.websocketMessages && httpFlow.websocketMessages.length > 0) {
                            for (const msg of httpFlow.websocketMessages) {
                                if (msg.content && msg.content.length > 0) {
                                    const msgText = getDecodedContent(msg.content);
                                    if (msgText.includes(filterText)) {
                                        isMatch = true;
                                        break;
                                    }
                                }
                            }
                        }
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    } catch (_e) {
                        // ignore decoding errors
                    }
                }
                break;
            case 'dnsFlow':
                const dnsFlow = flow.flow.value;
                const domainName = dnsFlow.request?.questions[0]?.name || '';
                if (domainName.toLowerCase().includes(filterText)) isMatch = true;
                break;
            case 'tcpFlow':
                const tcpFlow = flow.flow.value;
                const tcpServer = tcpFlow.server;
                const tcpText = `${tcpServer?.addressHost}:${tcpServer?.addressPort}`.toLowerCase();
                if (tcpText.includes(filterText)) isMatch = true;
                break;
            case 'udpFlow':
                const udpFlow = flow.flow.value;
                const udpServer = udpFlow.server;
                const udpText = `${udpServer?.addressHost}:${udpServer?.addressPort}`.toLowerCase();
                if (udpText.includes(filterText)) isMatch = true;
                break;
        }
    }

    if (!isMatch) return false;
  }

  // --- Advanced Filters ---

  // Flow Type Filter
  if (filter.flowTypes.length > 0) {
    if (!flow.flow?.case) {
        return false;
    }

    let currentFlowTypes: FlowType[];

    // Special handling for HTTP flows that are actually DNS-over-HTTP
    if (flow.flow.case === 'httpFlow') {
      const reqContentType = flow.httpFlowExtra?.request?.effectiveContentType;
      const resContentType = flow.httpFlowExtra?.response?.effectiveContentType;

      if (reqContentType === 'application/dns-message' || resContentType === 'application/dns-message') {
        currentFlowTypes = ['dns']; // Only consider it DNS, not HTTP
      } else {
        currentFlowTypes = ['http']; // Regular HTTP flow
      }
    } else {
      const type = flow.flow.case.replace('Flow', '').toLowerCase();
      // Validate type is a FlowType
      if (type === 'dns' || type === 'tcp' || type === 'udp') {
          currentFlowTypes = [type as FlowType];
      } else {
          currentFlowTypes = [];
      }
    }

    if (!currentFlowTypes.some(type => filter.flowTypes.includes(type))) {
      return false;
    }
  }

  // HTTP Specific Filters (AND logic)
  if (flow.flow.case === 'httpFlow') {
    const httpFlow = flow.flow.value;

    // HTTP Method Filter
    if (filter.http.methods.length > 0 && !filter.http.methods.includes(httpFlow.request?.method || '')) {
      return false;
    }

    // HTTP Status Code Filter
    if (filter.http.statusCodes.length > 0) {
        const flowStatusCode = httpFlow.response?.statusCode;
        if (flowStatusCode === undefined || flowStatusCode === null) {
            return false;
        }
        const statusCodeStr = flowStatusCode.toString();
        const matches = filter.http.statusCodes.some(sc => {
            if (sc.endsWith('xx')) {
                const prefix = sc.slice(0, 1);
                return statusCodeStr.startsWith(prefix);
            }
            if (sc.includes('-')) {
                const [start, end] = sc.split('-').map(Number);
                const code = Number(statusCodeStr);
                return code >= start && code <= end;
            }
            return statusCodeStr === sc;
        });
        if (!matches) {
            return false;
        }
    }

    // HTTP Content Type Filter
    if (filter.http.contentTypes.length > 0) {
        const reqContentType = flow.httpFlowExtra?.request?.effectiveContentType || '';
        const resContentType = flow.httpFlowExtra?.response?.effectiveContentType || '';
        const matches = filter.http.contentTypes.some(ct => reqContentType.includes(ct) || resContentType.includes(ct));
        if (!matches) {
            return false;
        }
    }
  }

  return true;
};
