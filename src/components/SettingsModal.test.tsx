import { render, screen, fireEvent } from '@testing-library/react';
import { vi, test, expect, describe, beforeEach } from 'vitest';
import SettingsModal from './SettingsModal';

// Create mocks for the store actions
const mockSetMaxFlows = vi.fn();
const mockSetMaxBodySize = vi.fn();
const mockSetTheme = vi.fn();

// Mock the store hook
vi.mock('../settingsStore', () => ({
  default: () => ({
    theme: 'system',
    setTheme: mockSetTheme,
    maxFlows: 500,
    setMaxFlows: mockSetMaxFlows,
    maxBodySize: 1024,
    setMaxBodySize: mockSetMaxBodySize,
  }),
}));

describe('SettingsModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('initializes with store values', () => {
    render(<SettingsModal isOpen={true} onClose={() => {}} />);
    const maxFlowsInput = screen.getByLabelText(/Maximum number of flows/i) as HTMLInputElement;
    const maxBodySizeInput = screen.getByLabelText(/Maximum body size/i) as HTMLInputElement;

    expect(maxFlowsInput.value).toBe('500');
    expect(maxBodySizeInput.value).toBe('1024');
  });

  test('does not update maxFlows immediately on change', () => {
    render(<SettingsModal isOpen={true} onClose={() => {}} />);
    const input = screen.getByLabelText(/Maximum number of flows/i);
    fireEvent.change(input, { target: { value: '1000' } });

    // Should NOT be called yet (this will fail with current implementation)
    expect(mockSetMaxFlows).not.toHaveBeenCalled();
  });

  test('updates maxFlows on Save', () => {
    const handleClose = vi.fn();
    render(<SettingsModal isOpen={true} onClose={handleClose} />);
    const input = screen.getByLabelText(/Maximum number of flows/i);
    fireEvent.change(input, { target: { value: '1000' } });

    // Verify Save button exists (this might fail if I haven't added it yet)
    // For TDD, I expect this to fail or I can add the button first.
    // But let's assume I want to see it fail.
    const saveButton = screen.getByRole('button', { name: /save/i });
    fireEvent.click(saveButton);

    expect(mockSetMaxFlows).toHaveBeenCalledWith(1000);
    expect(handleClose).toHaveBeenCalled();
  });

  test('cancels changes on Cancel', () => {
    const handleClose = vi.fn();
    render(<SettingsModal isOpen={true} onClose={handleClose} />);
    const input = screen.getByLabelText(/Maximum number of flows/i);
    fireEvent.change(input, { target: { value: '1000' } });

    const cancelButton = screen.getByRole('button', { name: /cancel/i });
    fireEvent.click(cancelButton);

    expect(mockSetMaxFlows).not.toHaveBeenCalled();
    expect(handleClose).toHaveBeenCalled();
  });

  test('updates theme immediately', () => {
    render(<SettingsModal isOpen={true} onClose={() => {}} />);
    const darkButton = screen.getByRole('button', { name: /Dark/i });
    fireEvent.click(darkButton);

    expect(mockSetTheme).toHaveBeenCalledWith('dark');
  });
});
