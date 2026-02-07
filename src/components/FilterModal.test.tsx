import { render, screen, fireEvent } from '@testing-library/react';
import { vi, test, expect, describe, beforeEach } from 'vitest';
import FilterModal from './FilterModal';

// Mock the store actions
const mockSetPinned = vi.fn();
const mockSetHasNote = vi.fn();
const mockSetFlowTypes = vi.fn();
const mockSetClientIps = vi.fn();
const mockSetHttpMethods = vi.fn();
const mockSetHttpStatusCodes = vi.fn();
const mockSetHttpContentTypes = vi.fn();

// Mock the store hook
vi.mock('../store', () => ({
  default: () => ({
    pinned: undefined,
    setPinned: mockSetPinned,
    hasNote: undefined,
    setHasNote: mockSetHasNote,
    flowTypes: [],
    setFlowTypes: mockSetFlowTypes,
    clientIps: [],
    setClientIps: mockSetClientIps,
    http: {
        methods: [],
        statusCodes: [],
        contentTypes: []
    },
    setHttpMethods: mockSetHttpMethods,
    setHttpStatusCodes: mockSetHttpStatusCodes,
    setHttpContentTypes: mockSetHttpContentTypes,
  }),
  FLOW_TYPES: [
    { value: 'http', label: 'HTTP' },
    { value: 'dns', label: 'DNS' },
    { value: 'tcp', label: 'TCP' },
    { value: 'udp', label: 'UDP' },
  ],
}));

describe('FilterModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('does not update pinned immediately', () => {
    render(<FilterModal isOpen={true} onClose={() => {}} uniqueClientIps={[]} />);

    fireEvent.click(screen.getAllByRole('button', { name: 'Yes' })[0]);

    expect(mockSetPinned).not.toHaveBeenCalled();
  });

  test('updates pinned on Apply', () => {
    const handleClose = vi.fn();
    render(<FilterModal isOpen={true} onClose={handleClose} uniqueClientIps={[]} />);

    fireEvent.click(screen.getAllByRole('button', { name: 'Yes' })[0]);

    const applyButton = screen.getByRole('button', { name: /apply/i });
    fireEvent.click(applyButton);

    expect(mockSetPinned).toHaveBeenCalledWith(true);
    expect(handleClose).toHaveBeenCalled();
  });

  test('cancels changes on Close (X button)', () => {
      const handleClose = vi.fn();
      render(<FilterModal isOpen={true} onClose={handleClose} uniqueClientIps={[]} />);

      fireEvent.click(screen.getAllByRole('button', { name: 'Yes' })[0]);

      // The close button is the one without text
      const closeButton = screen.getAllByRole('button').find(b => b.textContent === '');

      if (!closeButton) throw new Error("Close button not found");

      fireEvent.click(closeButton);

      expect(mockSetPinned).not.toHaveBeenCalled();
      expect(handleClose).toHaveBeenCalled();
  });

  test('clears filters locally on Clear All but does not commit until Apply', () => {
    render(<FilterModal isOpen={true} onClose={() => {}} uniqueClientIps={[]} />);
    const clearButton = screen.getByRole('button', { name: /clear all/i });
    fireEvent.click(clearButton);

    const applyButton = screen.getByRole('button', { name: /apply/i });
    fireEvent.click(applyButton);

    expect(mockSetPinned).toHaveBeenCalledWith(undefined);
    expect(mockSetHasNote).toHaveBeenCalledWith(undefined);
    expect(mockSetFlowTypes).toHaveBeenCalledWith([]);
  });
});
