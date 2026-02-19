import '@testing-library/jest-dom';
import { vi } from 'vitest';
import React from 'react';

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {}, // deprecated
    removeListener: () => {}, // deprecated
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});

class WorkerMock {
  url: string;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onmessageerror: ((event: MessageEvent) => void) | null = null;
  constructor(stringUrl: string) {
    this.url = stringUrl;
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  postMessage(_msg: unknown) {
    // Mock implementation or ignore
  }
  terminate() {}
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  addEventListener(_type: string, _listener: EventListener) {}
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  removeEventListener(_type: string, _listener: EventListener) {}
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  dispatchEvent(_event: Event): boolean { return true; }
}

global.Worker = WorkerMock as unknown as typeof Worker;

if (typeof URL.createObjectURL === 'undefined') {
  URL.createObjectURL = () => 'mock-url';
}
if (typeof URL.revokeObjectURL === 'undefined') {
  URL.revokeObjectURL = () => {};
}

// Mock react-virtuoso for testing
vi.mock('react-virtuoso', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const TableVirtuoso = React.forwardRef(({ data, itemContent, fixedHeaderContent, components, context, ...props }: any, ref) => {
      const Table = components?.Table || 'table';
      const TableHead = components?.TableHead || 'thead';
      const TableBody = components?.TableBody || 'tbody';
      const TableRow = components?.TableRow || 'tr';
      const Scroller = components?.Scroller || 'div';

      return React.createElement(Scroller, { ...props, ref, style: { ...props.style, height: '100%', overflow: 'auto' } },
        React.createElement(Table, { style: { width: '100%', borderCollapse: 'collapse' } },
            fixedHeaderContent && React.createElement(TableHead, null, fixedHeaderContent()),
            React.createElement(TableBody, null,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                data.map((item: any, index: number) =>
                    React.createElement(TableRow, { key: index, item: item, context: context, 'data-index': index },
                        itemContent(index, item)
                    )
                )
            )
        )
      );
  });
  TableVirtuoso.displayName = 'TableVirtuoso';
  return { TableVirtuoso, Virtuoso: () => null };
});
