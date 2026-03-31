import { Flow, FlowSummary } from "./gen/mitmflow/v1/mitmflow_pb";
import { Timestamp } from "@bufbuild/protobuf/wkt";


export type ContentFormat = 'auto' | 'text' | 'json' | 'protobuf' | 'grpc' | 'xml' | 'binary' | 'image' | 'dns' | 'javascript' | 'html';

export const formatTimestamp = (ts: number): string => {
  const d = new Date(ts);
  return d.toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
};

export const getHeader = (headers: { [key:string]: string } | undefined, name: string): string | undefined => {
    if (!headers) {
        return undefined;
    }
    const lowerCaseName = name.toLowerCase();
    for (const key in headers) {
        if (key.toLowerCase() === lowerCaseName) {
            return headers[key];
        }
    }
    return undefined;
}

export const getContentType = (headers: { [key: string]: string } | undefined): string | undefined => {
    return getHeader(headers, 'content-type');
};

export type FormattedContent = {
  data: string | Uint8Array;
  encoding: 'text' | 'base64' | 'binary'; // 'binary' for Uint8Array that HexViewer expects
  effectiveFormat: ContentFormat;
};

export const formatContent = (content: Uint8Array | string | undefined, format: ContentFormat, contentType: string | undefined, effectiveContentType?: string): FormattedContent => {
  let effectiveFormat = format;

  const typeToCheck = effectiveContentType || contentType;

  // Prioritize explicit format selection
  if (format !== 'auto') {
    effectiveFormat = format;
  } else if (typeToCheck) {
    // Auto-detect based on content type header
    if (typeToCheck.startsWith('application/json') || typeToCheck.startsWith('application/manifest+json')) {
      effectiveFormat = 'json';
    } else if (typeToCheck.includes('application/grpc') || typeToCheck.includes('application/grpc-web') || typeToCheck.includes('application/connect')) {
      effectiveFormat = 'grpc';
    } else if (typeToCheck.includes('application/proto') || typeToCheck.includes('application/x-protobuf')) {
      effectiveFormat = 'protobuf';
    } else if (typeToCheck.includes('text/html')) {
      effectiveFormat = 'html';
    } else if (typeToCheck.includes('image')) {
      effectiveFormat = 'image';
    } else if (typeToCheck.includes('xml')) {
      effectiveFormat = 'xml';
    } else if (typeToCheck.includes('text')) {
      effectiveFormat = 'text';
    } else if (typeToCheck.includes('javascript')) {
      effectiveFormat = 'javascript';
    } else if (typeToCheck.includes('application/octet')) {
      effectiveFormat = 'binary';
    } else if (typeToCheck.includes('application/dns-message')) {
      effectiveFormat = 'dns';
    } else if (typeToCheck.includes('text')) {
      effectiveFormat = 'text';
    } else {
      // Default to binary if auto-detection doesn't match known types
      effectiveFormat = 'binary';
    }
  } else {
    // Default to text if no content type header
    effectiveFormat = 'text';
  }

  if (!content) {
    // If content is empty, but effectiveFormat is json, return empty string as json
    if (effectiveFormat === 'json') {
      return { data: '', encoding: 'text', effectiveFormat: 'json' };
    }
    switch (effectiveFormat) {
      case 'binary':
      case 'protobuf':
      case 'grpc':
        return { data: new Uint8Array(), encoding: 'binary', effectiveFormat: effectiveFormat };
      default:
        return { data: '', encoding: 'text', effectiveFormat: 'text' };
    }
  }

  const contentAsUint8Array = typeof content === 'string' ? new TextEncoder().encode(content) : content;
  const getContentAsString = () => typeof content === 'string' ? content : new TextDecoder().decode(contentAsUint8Array);

  switch (effectiveFormat) {
    case 'json':
      try {
        const contentAsString = getContentAsString();
        const parsedJson = JSON.parse(contentAsString);
        return { data: JSON.stringify(parsedJson, null, 2), encoding: 'text', effectiveFormat: effectiveFormat };
      } catch {
        // If JSON parsing fails, return the raw string content as text, but keep effectiveFormat as 'json'
        // so SyntaxHighlighter still tries to highlight it as JSON.
        return { data: getContentAsString(), encoding: 'text', effectiveFormat: 'json' };
      }
    case 'html':
      return { data: getContentAsString(), encoding: 'text', effectiveFormat: effectiveFormat };
    case 'xml':
    case 'javascript':
    case 'text':
      return { data: getContentAsString(), encoding: 'text', effectiveFormat: effectiveFormat };
    case 'dns':
    case 'image': {
      let binary = '';
      const chunkSize = 0x8000;
      for (let i = 0; i < contentAsUint8Array.length; i += chunkSize) {
        const chunk = contentAsUint8Array.subarray(i, i + chunkSize);
        binary += String.fromCharCode.apply(null, Array.from(chunk));
      }
      return { data: btoa(binary), encoding: 'base64', effectiveFormat: effectiveFormat };
    }
    case 'binary':
    case 'protobuf':
    case 'grpc':
      return { data: contentAsUint8Array, encoding: 'binary', effectiveFormat: effectiveFormat };
    default:
      // This default should ideally not be reached if effectiveFormat is always set.
      // Fallback to binary for safety if an unknown effectiveFormat somehow occurs.
      return { data: contentAsUint8Array, encoding: 'binary', effectiveFormat: effectiveFormat };
  }
};

interface TimestampWithSecondsNanos {
  seconds: bigint;
  nanos: number;
}

type TimestampInput = TimestampWithSecondsNanos | string | { seconds: string | number | bigint, nanos: number } | undefined;

export const getTimestamp = (ts: TimestampInput): number => {
  if (!ts) {
    return 0;
  }
  if (typeof ts === 'string') {
    return new Date(ts).getTime();
  }
  const seconds = (typeof ts.seconds === 'string' || typeof ts.seconds === 'number') ? BigInt(ts.seconds) : ts.seconds;
  return Number(seconds) * 1000 + ts.nanos / 1000000;
}

// Helper to handle oneof summary in both Protobuf and plain JSON formats
export const getSummary = (flow: FlowSummary | undefined | null) => {
  if (!flow) return { case: undefined, value: undefined };
  
  if (flow.summary && flow.summary.case) {
    return flow.summary;
  }

  // Fallback for plain JSON objects where oneof fields are at the top level
  const anyFlow = flow as unknown as Record<string, unknown>;
  if (anyFlow.http) return { case: 'http' as const, value: anyFlow.http as NonNullable<FlowSummary['summary']['value']> };
  if (anyFlow.dns) return { case: 'dns' as const, value: anyFlow.dns as NonNullable<FlowSummary['summary']['value']> };
  if (anyFlow.tcp) return { case: 'tcp' as const, value: anyFlow.tcp as NonNullable<FlowSummary['summary']['value']> };
  if (anyFlow.udp) return { case: 'udp' as const, value: anyFlow.udp as NonNullable<FlowSummary['summary']['value']> };
  
  return { case: undefined, value: undefined };
};

// Returns a full human-readable date/time string (local timezone) for a millisecond epoch.
// Falls back to '...' if timestamp is falsy (0 or undefined) which indicates missing data.
export const formatDateTime = (ms: number | undefined): string => {
  if (!ms) return '...';
  const d = new Date(ms);
  // Use toLocaleString with explicit options for consistency across environments.
  return d.toLocaleString(undefined, {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
  });
};

export const getFlowId = (flow: Flow | FlowSummary | undefined | null): string | undefined => {
  if (!flow) return undefined;
  // Check if it's a FlowSummary (has top-level id)
  if ('id' in flow && typeof flow.id === 'string' && flow.id) {
    return flow.id;
  }
  // It's a Flow (id is inside oneof)
  const anyFlow = flow as unknown as { 
    flow?: { 
        case?: string, 
        value: { id: string },
        httpFlow?: { id: string },
        dnsFlow?: { id: string },
        tcpFlow?: { id: string },
        udpFlow?: { id: string }
    } 
  };
  if (anyFlow.flow) {
    const f = anyFlow.flow;
    if (f.case === 'httpFlow') return f.value.id;
    if (f.case === 'dnsFlow') return f.value.id;
    if (f.case === 'tcpFlow') return f.value.id;
    if (f.case === 'udpFlow') return f.value.id;
    
    // Fallback for plain JSON
    if (f.httpFlow) return f.httpFlow.id;
    if (f.dnsFlow) return f.dnsFlow.id;
    if (f.tcpFlow) return f.tcpFlow.id;
    if (f.udpFlow) return f.udpFlow.id;
  }
  return undefined;
};

export const getFlowTimestampStart = (flow: Flow | FlowSummary | undefined | null): Timestamp | undefined => {
  if (!flow) return undefined;
  const anyFlow = flow as unknown as {
    timestampStart?: Timestamp,
    flow?: {
        case?: string,
        value?: { timestampStart?: Timestamp },
        httpFlow?: { timestampStart?: Timestamp },
        dnsFlow?: { timestampStart?: Timestamp },
        tcpFlow?: { timestampStart?: Timestamp },
        udpFlow?: { timestampStart?: Timestamp }
    }
  };
  // Check if it's a FlowSummary (has top-level timestampStart)
  if (anyFlow.timestampStart) {
    return anyFlow.timestampStart;
  }
  // It's a Flow
  if (anyFlow.flow) {
    const f = anyFlow.flow;
    if (f.case) {
        return f.value?.timestampStart;
    }
    // Fallback for plain JSON
    const inner = f.httpFlow || f.dnsFlow || f.tcpFlow || f.udpFlow;
    return inner?.timestampStart;
  }
  return undefined;
};

export const getFlowTimestampNs = (flow: Flow | FlowSummary | undefined | null): bigint => {
  const ts = getFlowTimestampStart(flow);
  if (!ts) return BigInt(0);
  return BigInt(ts.seconds) * BigInt(1000000000) + BigInt(ts.nanos);
};

export const formatDuration = (durationMs: number | undefined): string => {
    if (durationMs === undefined) {
        return '...';
    }

    const sign = durationMs < 0 ? '-' : '';
    const absDuration = Math.abs(durationMs);

    if (absDuration < 1000) {
        return `${sign}${absDuration.toFixed(0)} ms`;
    }
    if (absDuration < 60 * 1000) {
        return `${sign}${(absDuration / 1000).toFixed(2)} s`;
    }
    if (absDuration < 60 * 60 * 1000) {
        return `${sign}${(absDuration / (60 * 1000)).toFixed(2)} min`;
    }
    return `${sign}${(absDuration / (60 * 60 * 1000)).toFixed(2)} h`;
}

export const formatSize = (bytes: number | undefined, decimals = 2): string => {
    if (bytes === undefined) {
        return '...';
    }
    if (bytes === 0) {
        return '0 Bytes';
    }

    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];

    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

export const formatTimestampWithRelative = (ts: number, relativeTo: number): string => {
    const date = new Date(ts);
    const absolute = date.toLocaleTimeString('en-US', {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    }) + '.' + date.getMilliseconds().toString().padStart(3, '0');

    if (ts === relativeTo) {
        return absolute;
    }

    const diff = ts - relativeTo;
    const relativeFormatted = formatDuration(Math.abs(diff));

    if (diff >= 0) {
        return `${absolute} (+${relativeFormatted})`;
    } else {
        return `${absolute} (-${relativeFormatted})`;
    }
};

export const getFlowTitle = (flow: Flow | FlowSummary): string => {
    const summary = getSummary(flow as FlowSummary);
    if (summary && summary.case) {
        // FlowSummary
        switch (summary.case) {
            case 'http':
                return `${summary.value.method} ${summary.value.url}`;
            case 'dns':
                return `dns://${summary.value.questionName}`; // Assuming questionName is in summary
            case 'tcp':
                return `tcp://${summary.value.clientPeernameHost}:${summary.value.clientPeernamePort} -> ${summary.value.serverAddressHost}:${summary.value.serverAddressPort}`;
            case 'udp':
                return `udp://${summary.value.clientPeernameHost}:${summary.value.clientPeernamePort} -> ${summary.value.serverAddressHost}:${summary.value.serverAddressPort}`;
            default:
                return '';
        }
    } else if ('flow' in flow && flow.flow) {
        // Flow
        switch (flow.flow.case) {
            case 'httpFlow':
                const httpFlow = flow.flow.value;
                const url = (httpFlow.request?.prettyUrl || httpFlow.request?.url) ?? '';
                const urlWithoutQuery = url.split('?')[0];
                return `${httpFlow.request?.method} ${urlWithoutQuery}`;
            case 'dnsFlow':
                const dnsFlow = flow.flow.value;
                return `dns://${dnsFlow.server?.addressHost}`; // Or question if available
            case 'tcpFlow':
                const tcpFlow = flow.flow.value;
                return `tcp://${tcpFlow.client?.peernameHost}:${tcpFlow.client?.peernamePort} -> ${tcpFlow.server?.addressHost}:${tcpFlow.server?.addressPort}`;
            case 'udpFlow':
                const udpFlow = flow.flow.value;
                return `udp://${udpFlow.client?.peernameHost}:${udpFlow.client?.peernamePort} -> ${udpFlow.server?.addressHost}:${udpFlow.server?.addressPort}`;
            default:
                return '';
        }
    }
    return '';
}

export const formatBytes = (bytes: number | undefined, decimals = 2): string => {
    if (bytes === undefined) {
        return '...';
    }
    if (bytes === 0) {
        return '0 B';
    }

    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];

    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}
