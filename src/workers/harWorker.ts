/// <reference lib="webworker" />

import { generateHarBlob, WorkerMessage, WorkerResponse } from '../harUtils';

// Declare self as a dedicated worker global scope
declare const self: DedicatedWorkerGlobalScope;

self.onmessage = (event: MessageEvent<WorkerMessage>) => {
  const { id, flows } = event.data;
  try {
    const blob = generateHarBlob(flows);
    self.postMessage({ id, success: true, blob } as WorkerResponse);
  } catch (error) {
    self.postMessage({ id, success: false, error: String(error) } as WorkerResponse);
  }
};
