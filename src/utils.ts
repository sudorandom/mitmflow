import { Flow } from "./gen/mitmflow/v1/mitmflow_pb";

export type ContentFormat = 'auto' | 'text' | 'json' | 'protobuf' | 'grpc' | 'grpc-web' | 'xml' | 'binary' | 'image' | 'dns' | 'javascript' | 'html';

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

export const formatContent = (content: Uint8Array | string | undefined, format: ContentFormat, contentType: string | undefined): FormattedContent => {
  let effectiveFormat = format;

  // Prioritize explicit format selection
  if (format !== 'auto') {
    effectiveFormat = format;
  } else if (contentType) {
    // Auto-detect based on content type header
    if (contentType.startsWith('application/json') || contentType.startsWith('application/manifest+json')) {
      effectiveFormat = 'json';
    } else if (contentType.includes('application/grpc-web')) {
      effectiveFormat = 'grpc-web';
    } else if (contentType.includes('application/grpc')) {
      effectiveFormat = 'grpc';
    } else if (contentType.includes('application/proto') || contentType.includes('application/x-protobuf')) {
      effectiveFormat = 'protobuf';
    } else if (contentType.includes('text/html')) {
      effectiveFormat = 'html';
    } else if (contentType.includes('image')) {
      effectiveFormat = 'image';
    } else if (contentType.includes('xml')) {
      effectiveFormat = 'xml';
    } else if (contentType.includes('text')) {
      effectiveFormat = 'text';
    } else if (contentType.includes('javascript')) {
      effectiveFormat = 'javascript';
    } else if (contentType.includes('application/octet')) {
      effectiveFormat = 'binary';
    } else if (contentType.includes('dns')) {
      effectiveFormat = 'dns';
    } else if (contentType.includes('text')) {
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
    case 'dns':
    case 'text':
      return { data: contentAsString, encoding: 'text', effectiveFormat: effectiveFormat };
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
    default:
      return undefined;
  }
};
