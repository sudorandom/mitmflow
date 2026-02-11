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
    // Process in chunks to avoid stack overflow with String.fromCharCode.apply and improve performance
    let binary = '';
    const chunkSize = 0x8000; // 32KB chunks
    for (let i = 0; i < content.length; i += chunkSize) {
      const chunk = content.subarray(i, i + chunkSize);
      binary += String.fromCharCode.apply(null, Array.from(chunk));
    }
    return { size: content.length, text: btoa(binary), mimeType: contentType, encoding: 'base64' };
  }
};


