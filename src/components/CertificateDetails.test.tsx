import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { CertificateDetails } from './CertificateDetails';
import type { Cert } from '../gen/mitmflow/v1/mitmflow_pb';
import type { Timestamp } from '@bufbuild/protobuf/wkt';

// Minimal Cert shape for test (structural typing)
// Create a minimal Timestamp-like object; sufficient for getTimestamp which reads seconds/nanos.
const makeTimestamp = (seconds: number): Timestamp => ({ seconds: BigInt(seconds), nanos: 0 } as unknown as Timestamp);

describe('CertificateDetails', () => {
  it('renders formatted human-readable dates instead of raw millisecond numbers', () => {
    const cert: Partial<Cert> = {
      cn: 'example.com',
      organization: 'Example Org',
      issuers: { CN: 'Test Issuer' },
      notbefore: makeTimestamp(1704067200), // 2024-01-01T00:00:00Z
      notafter: makeTimestamp(1735689600),  // 2024-12-31T00:00:00Z
      hasexpired: false,
      altnames: ['www.example.com'],
      serial: 'ABCD1234',
      isCa: false,
  };

  // Cast to Cert since we only need subset for this test.
  render(<CertificateDetails cert={cert as Cert} />);

    const notBeforeLabel = screen.getByText('Not Before:');
    expect(notBeforeLabel).toBeInTheDocument();
    // Next sibling contains the formatted date
    const notBeforeValue = notBeforeLabel.nextElementSibling as HTMLElement;
    expect(notBeforeValue.textContent).toMatch(/2024/);
    expect(notBeforeValue.textContent).not.toMatch(/1704067200000/);

    const notAfterLabel = screen.getByText('Not After:');
    const notAfterValue = notAfterLabel.nextElementSibling as HTMLElement;
    expect(notAfterValue.textContent).toMatch(/2024|2025/); // Year in range
    expect(notAfterValue.textContent).not.toMatch(/1735689600000/);
  });
});
