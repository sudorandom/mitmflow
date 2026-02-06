import '@testing-library/jest-dom';

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
