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
  postMessage(msg: any) {
    // Mock implementation or ignore
  }
  terminate() {}
  addEventListener(type: string, listener: EventListener) {}
  removeEventListener(type: string, listener: EventListener) {}
  dispatchEvent(event: Event): boolean { return true; }
}

global.Worker = WorkerMock as any;

if (typeof URL.createObjectURL === 'undefined') {
  URL.createObjectURL = () => 'mock-url';
}
if (typeof URL.revokeObjectURL === 'undefined') {
  URL.revokeObjectURL = () => {};
}
