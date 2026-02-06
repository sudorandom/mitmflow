import { Flow } from "./gen/mitmflow/v1/mitmflow_pb";
import { getTimestamp } from './utils';

export const getHarContent = (content: Uint8Array | undefined, contentType: string | undefined) => {
  if (!content || content.length === 0) {
    return { size: 0, text: '', mimeType: contentType || 'application/octet-stream' };
  }
  contentType = contentType || 'application/octet-stream';
  const contentAsString = new TextDecoder().decode(content);

  // Check for common text-based content types
  if (contentType.includes('json') || contentType.includes('xml') || contentType.includes('text')) {
    return { size: content.length, text: contentAsString, mimeType : contentType };
  } else {
    // For other types (binary, image, etc.), base64 encode
    // Avoid spread operator to prevent stack overflow on large content
    let binary = '';
    for (let i = 0; i < content.length; i++) {
      binary += String.fromCharCode(content[i]);
    }
    return { size: content.length, text: btoa(binary), mimeType: contentType, encoding: 'base64' };
  }
};

export const generateHarBlob = (flowsToExport: Flow[]): Blob => {
  // Find earliest timestamp across flows (prefer request.start, else flow.start)
  const earliestMs = flowsToExport.reduce((min, flow) => {
    if (!flow.flow || !flow.flow.case) return min;
    if (flow.flow.case === 'httpFlow') {
      const httpFlow = flow.flow.value;
      const reqStart = getTimestamp(httpFlow.request?.timestampStart);
      const flowStart = getTimestamp(httpFlow.timestampStart);
      const candidate = reqStart > 0 ? reqStart : flowStart;
      if (candidate > 0 && (min === 0 || candidate < min)) return candidate;
    }
    return min;
  }, 0);

  const pageId = 'page_0';
  const pages = earliestMs > 0 ? [{
    id: pageId,
    startedDateTime: new Date(earliestMs).toISOString(),
    title: 'mitmflow capture',
    pageTimings: {}
  }] : [];

  const har = {
    log: {
      version: "1.2",
      creator: { name: "mitm-flows", version: "1.0" },
      pages,
      entries: flowsToExport.flatMap(flow => {
        if (flow?.flow?.case === 'httpFlow') {
          const httpFlow = flow.flow.value;
          // Convert query string to array of {name, value}
          let queryString: { name: string; value: string }[] = [];
          if (httpFlow.request?.url) {
            try {
              const urlObj = new URL(httpFlow.request.url);
              queryString = Array.from(urlObj.searchParams.entries()).map(([name, value]) => ({ name, value }));
            } catch {
              // fallback: empty array
            }
          }

          // HAR timings: derive from request/response timestamps if available
          const reqStartMs = getTimestamp(httpFlow.request?.timestampStart);
          const reqEndMs = getTimestamp(httpFlow.request?.timestampEnd);
          const resStartMs = getTimestamp(httpFlow.response?.timestampStart);
          const resEndMs = getTimestamp(httpFlow.response?.timestampEnd);

          const send = reqStartMs > 0 && reqEndMs > 0 && reqEndMs >= reqStartMs ? reqEndMs - reqStartMs : 0;
          const wait = reqEndMs > 0 && resStartMs > 0 && resStartMs >= reqEndMs ? resStartMs - reqEndMs : 0;
          const receive = resStartMs > 0 && resEndMs > 0 && resEndMs >= resStartMs ? resEndMs - resStartMs : 0;
          const timings = { send, wait, receive };
          const time = send + wait + receive;

          // Only include postData for methods that can have a body
          let postData: ReturnType<typeof getHarContent> | undefined = undefined;
          const method = httpFlow.request?.method || '';
          if (["POST", "PUT", "PATCH", "DELETE"].includes(method.toUpperCase()) && httpFlow.request?.content && httpFlow.request.content.length > 0) {
            postData = getHarContent(httpFlow.request?.content, flow.httpFlowExtra?.request?.effectiveContentType);
          }

          const startTime = reqStartMs > 0 ? reqStartMs : getTimestamp(httpFlow.timestampStart);
          const startedDateTime = startTime > 0 ? new Date(startTime).toISOString() : new Date().toISOString();

          return [{
            pageref: pages.length ? pageId : undefined,
            connection: httpFlow.server?.addressPort ? String(httpFlow.server.addressPort) : '',
            startedDateTime,
            time,
            timings,
            cache: {},
            request: {
              method,
              url: httpFlow.request?.prettyUrl || httpFlow.request?.url || '',
              httpVersion: httpFlow.request?.httpVersion || 'HTTP/1.1',
              headers: httpFlow.request?.headers ? Object.entries(httpFlow.request.headers).map(([name, value]) => ({ name, value })) : [],
              queryString,
              cookies: [],
              ...(postData ? { postData } : {}),
              headersSize: -1,
              bodySize: httpFlow.request?.content ? httpFlow.request.content.length : 0,
            },
            response: {
              status: httpFlow.response?.statusCode || 0,
              statusText: httpFlow.response?.reason || 'OK',
              httpVersion: httpFlow.response?.httpVersion || 'HTTP/1.1',
              headers: httpFlow.response?.headers ? Object.entries(httpFlow.response.headers).map(([name, value]) => ({ name, value })) : [],
              cookies: [],
              content: getHarContent(httpFlow.response?.content, flow.httpFlowExtra?.response?.effectiveContentType),
              headersSize: -1,
              bodySize: httpFlow.response?.content ? httpFlow.response.content.length : 0,
            },
            serverIPAddress: httpFlow.server?.addressHost || '',
          }];
        }
        return [];
      })
    }
  };
  return new Blob([JSON.stringify(har, null, 2)], { type: 'application/json;charset=utf-8' });
};

export interface WorkerMessage {
  id: string;
  flows: Flow[];
}

export interface WorkerResponse {
  id: string;
  success: boolean;
  blob?: Blob;
  error?: string;
}
