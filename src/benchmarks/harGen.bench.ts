import { bench, describe } from 'vitest';
import { generateHarBlob } from '../harUtils';
import { FlowSchema } from '../gen/mitmflow/v1/mitmflow_pb';
import { create } from '@bufbuild/protobuf';

// Helper to create a dummy flow
const createDummyFlow = (i: number) => {
  return create(FlowSchema, {
    flow: {
      case: 'httpFlow',
      value: {
        id: `flow-${i}`,
        request: {
          url: `http://example.com/api/resource/${i}?query=param`,
          method: 'POST',
          headers: { 'User-Agent': 'Benchmark', 'Content-Type': 'application/json' },
          content: new TextEncoder().encode(`Request body content that is somewhat long to simulate real data ${i}`),
          timestampStart: { seconds: BigInt(1600000000 + i), nanos: 0 },
          timestampEnd: { seconds: BigInt(1600000000 + i), nanos: 500000000 },
        },
        response: {
          statusCode: 200,
          reason: 'OK',
          headers: { 'Content-Type': 'application/json', 'Server': 'Benchmark' },
          content: new TextEncoder().encode(JSON.stringify({
            data: `Response body data for item ${i}`,
            meta: { timestamp: 1600000000 + i, status: "active" },
            list: [1, 2, 3, 4, 5]
          })),
          timestampStart: { seconds: BigInt(1600000000 + i), nanos: 600000000 },
          timestampEnd: { seconds: BigInt(1600000000 + i), nanos: 900000000 },
        },
        timestampStart: { seconds: BigInt(1600000000 + i), nanos: 0 },
      }
    }
  });
};

const smallSet = Array.from({ length: 100 }, (_, i) => createDummyFlow(i));
const mediumSet = Array.from({ length: 1000 }, (_, i) => createDummyFlow(i));
const largeSet = Array.from({ length: 5000 }, (_, i) => createDummyFlow(i));

describe('HAR Generation', () => {
  bench('Small set (100 flows)', () => {
    generateHarBlob(smallSet);
  });

  bench('Medium set (1000 flows)', () => {
    generateHarBlob(mediumSet);
  });

  bench('Large set (5000 flows)', () => {
    generateHarBlob(largeSet);
  });
});
