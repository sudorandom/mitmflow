import '@testing-library/jest-dom';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import { setupAgTestIds } from 'ag-grid-community';

// Ensure cleanup after each test
afterEach(() => {
  cleanup();
});

// Setup AG Grid Test IDs
setupAgTestIds();
