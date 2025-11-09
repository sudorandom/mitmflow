import { Flow } from "./gen/mitmflow/v1/mitmflow_pb";
import * as DNSPacket from 'dns-suite';

export type ContentFormat = 'auto' | 'text' | 'json' | 'protobuf' | 'grpc' | 'grpc-web' | 'xml' | 'binary' | 'image' | 'dns' | 'javascript' | 'html';

const parseDnsPacket = (content: Uint8Array): string => {
    try {
        const dnsPacket = DNSPacket.DNSPacket.parse(content);
        let output = '';
        output += `ID: ${dnsPacket.header.id}\n`;
        output += `Type: ${dnsPacket.header.qr ? 'Response' : 'Query'}\n`;
        output += `Opcode: ${dnsPacket.header.opcode}\n`;
        output += `Flags: ${dnsPacket.header.aa ? 'AA' : ''} ${dnsPacket.header.tc ? 'TC' : ''} ${dnsPacket.header.rd ? 'RD' : ''} ${dnsPacket.header.ra ? 'RA' : ''}\n`;
        output += `RCODE: ${dnsPacket.header.rcode}\n\n`;

        if (dnsPacket.question.length > 0) {
            output += 'Questions:\n';
            dnsPacket.question.forEach(q => {
                output += `  ${q.name}  ${q.className}  ${q.typeName}\n`;
            });
            output += '\n';
        }

        if (dnsPacket.answer.length > 0) {
            output += 'Answers:\n';
            dnsPacket.answer.forEach(a => {
                output += `  ${a.name}  ${a.className}  ${a.typeName}  ${a.ttl}  ${a.address || a.data}\n`;
            });
            output += '\n';
        }

        if (dnsPacket.authority.length > 0) {
            output += 'Authorities:\n';
            dnsPacket.authority.forEach(a => {
                output += `  ${a.name}  ${a.className}  ${a.typeName}  ${a.ttl}  ${a.address || a.data}\n`;
            });
            output += '\n';
        }

        if (dnsPacket.additional.length > 0) {
            output += 'Additional:\n';
            dnsPacket.additional.forEach(a => {
                output += `  ${a.name}  ${a.className}  ${a.typeName}  ${a.ttl}  ${a.address || a.data}\n`;
            });
        }
        return output;
    } catch (e) {
        console.error('Failed to parse DNS packet:', e);
        return 'Failed to parse DNS packet';
    }
}

export const formatTimestamp = (ts: number): string => {
  const date = new Date(ts);
  return date.toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }) + '.' + date.getMilliseconds().toString().padStart(3, '0');
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
    } else if (typeToCheck.includes('application/grpc-web')) {
      effectiveFormat = 'grpc-web';
    } else if (typeToCheck.includes('application/grpc')) {
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

  console.log('formatContent - Determined effectiveFormat:', effectiveFormat);

  if (!content) {
    // If content is empty, but effectiveFormat is json, return empty string as json
    if (effectiveFormat === 'json') {
      return { data: '', encoding: 'text', effectiveFormat: 'json' };
    }
    switch (effectiveFormat) {
      case 'binary':
      case 'protobuf':
      case 'grpc':
      case 'grpc-web':
        return { data: new Uint8Array(), encoding: 'binary', effectiveFormat: effectiveFormat };
      default:
        return { data: '', encoding: 'text', effectiveFormat: 'text' };
    }
  }

  const contentAsUint8Array = typeof content === 'string' ? new TextEncoder().encode(content) : content;
  const contentAsString = typeof content === 'string' ? content : new TextDecoder().decode(contentAsUint8Array);

  switch (effectiveFormat) {
    case 'json':
      try {
        const parsedJson = JSON.parse(contentAsString);
        return { data: JSON.stringify(parsedJson, null, 2), encoding: 'text', effectiveFormat: effectiveFormat };
      } catch {
        // If JSON parsing fails, return the raw string content as text, but keep effectiveFormat as 'json'
        // so SyntaxHighlighter still tries to highlight it as JSON.
        return { data: contentAsString, encoding: 'text', effectiveFormat: 'json' };
      }
    case 'html':
      return { data: contentAsString, encoding: 'text', effectiveFormat: effectiveFormat };
    case 'xml':
    case 'javascript':
    case 'text':
      return { data: contentAsString, encoding: 'text', effectiveFormat: effectiveFormat };
    case 'dns':
        return { data: parseDnsPacket(contentAsUint8Array), encoding: 'text', effectiveFormat: 'text' };
    case 'image':
      return { data: btoa(String.fromCharCode(...contentAsUint8Array)), encoding: 'base64', effectiveFormat: effectiveFormat };
    case 'binary':
    case 'protobuf':
    case 'grpc':
    case 'grpc-web':
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

type TimestampInput = TimestampWithSecondsNanos | undefined;

export const getTimestamp = (ts: TimestampInput): number => {
  if (!ts) {
    return 0;
  }
  return Number(ts.seconds) * 1000 + ts.nanos / 1000000;
}

export const getFlowId = (flow: Flow | undefined | null): string | undefined => {
  if (!flow || !flow.flow) {
    return undefined;
  }
  switch (flow.flow.case) {
    case 'httpFlow':
      return flow.flow.value.id;
    case 'dnsFlow':
      return flow.flow.value.id;
    case 'tcpFlow':
        return flow.flow.value.id;
    case 'udpFlow':
        return flow.flow.value.id;
    default:
      return undefined;
  }
};

export const formatDuration = (durationMs: number | undefined): string => {
    if (durationMs === undefined) {
        return '...';
    }
    if (durationMs < 1000) {
        return `${durationMs.toFixed(0)} ms`;
    }
    return `${(durationMs / 1000).toFixed(2)} s`;
}

export const formatSize = (size: number | undefined): string => {
    if (size === undefined) {
        return '...';
    }
    if (size < 1024) {
        return `${size} B`;
    }
    if (size < 1024 * 1024) {
        return `${(size / 1024).toFixed(2)} KB`;
    }
    return `${(size / (1024 * 1024)).toFixed(2)} MB`;
}

export const getFlowTitle = (flow: Flow): string => {
    if (!flow.flow) {
        return '';
    }
    switch (flow.flow.case) {
        case 'httpFlow':
            const httpFlow = flow.flow.value;
            return `${httpFlow.response?.statusCode ?? '...'} ${httpFlow.request?.method} ${httpFlow.request?.url}`;
        case 'dnsFlow':
            const dnsFlow = flow.flow.value;
            return `${dnsFlow.response ? 'OK' : 'ERROR'} dns://${dnsFlow.server?.addressHost}`;
        case 'tcpFlow':
            const tcpFlow = flow.flow.value;
            return `TCP ${tcpFlow.client?.peernameHost}:${tcpFlow.client?.peernamePort} -> ${tcpFlow.server?.addressHost}:${tcpFlow.server?.addressPort}`;
        case 'udpFlow':
            const udpFlow = flow.flow.value;
            return `UDP ${udpFlow.client?.peernameHost}:${udpFlow.client?.peernamePort} -> ${udpFlow.server?.addressHost}:${udpFlow.server?.addressPort}`;
        default:
            return '';
    }
}
