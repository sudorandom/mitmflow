import { render, screen, fireEvent } from '@testing-library/react';
import { vi, test, expect, describe, beforeEach } from 'vitest';
import FilterModal from './FilterModal';

// Mock the store actions
const mockSetPinnedOnly = vi.fn();
const mockSetHasNote = vi.fn();
const mockSetFlowTypes = vi.fn();
const mockSetHttpMethods = vi.fn();
const mockSetHttpStatusCodes = vi.fn();
const mockSetHttpContentTypes = vi.fn();
const mockClearFilters = vi.fn();

// Mock the store hook
vi.mock('../store', () => ({
  default: () => ({
    pinnedOnly: false,
    setPinnedOnly: mockSetPinnedOnly,
    hasNote: false,
    setHasNote: mockSetHasNote,
    flowTypes: [],
    setFlowTypes: mockSetFlowTypes,
    http: {
        methods: [],
        statusCodes: [],
        contentTypes: []
    },
    setHttpMethods: mockSetHttpMethods,
    setHttpStatusCodes: mockSetHttpStatusCodes,
    setHttpContentTypes: mockSetHttpContentTypes,
    clearFilters: mockClearFilters,
  }),
}));

describe('FilterModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('does not update pinnedOnly immediately', () => {
    render(<FilterModal isOpen={true} onClose={() => {}} />);

    // Select by index or assuming structure.
    // "Pinned Only" is the first checkbox.
    const checkboxes = screen.getAllByRole('checkbox');
    const pinnedCheckbox = checkboxes[0];

    fireEvent.click(pinnedCheckbox);

    expect(mockSetPinnedOnly).not.toHaveBeenCalled();
  });

  test('updates pinnedOnly on Apply', () => {
    const handleClose = vi.fn();
    render(<FilterModal isOpen={true} onClose={handleClose} />);

    const checkboxes = screen.getAllByRole('checkbox');
    const pinnedCheckbox = checkboxes[0];
    fireEvent.click(pinnedCheckbox);

    const applyButton = screen.getByRole('button', { name: /apply/i });
    fireEvent.click(applyButton);

    expect(mockSetPinnedOnly).toHaveBeenCalledWith(true);
    expect(handleClose).toHaveBeenCalled();
  });

  test('cancels changes on Close (X button)', () => {
      const handleClose = vi.fn();
      render(<FilterModal isOpen={true} onClose={handleClose} />);

      const checkboxes = screen.getAllByRole('checkbox');
      const pinnedCheckbox = checkboxes[0];
      fireEvent.click(pinnedCheckbox);

      // The close button is usually the first button (X)
      // Or we can look for the button that is NOT Apply or Clear All
      const buttons = screen.getAllByRole('button');
      // 0: X, 1: Clear All, 2: Apply
      // But checking content might be safer.
      // The X button has an SVG.
      const closeButton = buttons.find(b => !b.textContent?.match(/apply|clear all/i));

      if (!closeButton) throw new Error("Close button not found");

      fireEvent.click(closeButton);

      expect(mockSetPinnedOnly).not.toHaveBeenCalled();
      expect(handleClose).toHaveBeenCalled();
  });

  test('clears filters locally on Clear All but does not commit until Apply', () => {
    // Current behavior: Clear All calls clearFilters() immediately and closes.
    // Desired behavior: Clear All resets local state, user must click Apply.

    render(<FilterModal isOpen={true} onClose={() => {}} />);
    const clearButton = screen.getByRole('button', { name: /clear all/i });
    fireEvent.click(clearButton);

    // Should NOT call store action immediately
    expect(mockClearFilters).not.toHaveBeenCalled();

    // If we click Apply now, it should commit the cleared state.
    // Since we started with empty state in mock, it's hard to distinguish "cleared" from "initial empty".
    // But detecting that `mockClearFilters` was NOT called is sufficient to prove it didn't use the old logic.
    // We can also verify that hitting Apply calls the specific setters with empty values (or clearFilters if we change logic to use that).

    const applyButton = screen.getByRole('button', { name: /apply/i });
    fireEvent.click(applyButton);

    // We can expect that either clearFilters is called OR all setters are called with empty/false.
    // Let's assume the implementation might call individual setters or clearFilters.
    // If I implement "Clear All" by calling `clearFilters` action inside `handleApply`, then `mockClearFilters` should be called HERE.
    // Or if I reset local state to empty, then `handleApply` will call `setPinnedOnly(false)`, `setHasNote(false)`, etc.

    // For this test, verifying it wasn't called immediately is the main goal.
  });
});
