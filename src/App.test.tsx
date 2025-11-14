import { render, screen, fireEvent } from '@testing-library/react';
import { vi, test, expect } from 'vitest';
import App from './App';
import { createClient } from '@connectrpc/connect';

vi.mock('@connectrpc/connect');

const mockedCreateClient = vi.mocked(createClient);

test('renders the main app component', () => {
    mockedCreateClient.mockReturnValue({
        streamFlows: async function* () {
            // empty stream by default
        },
        exportFlow: async function () {
            return Promise.resolve({ received: true, message: "ok", flowsProcessed: 0n });
        }
    } as unknown as ReturnType<typeof createClient>);
    render(<App />);
    const linkElement = screen.getByRole('heading', { name: /Flows/i });
    expect(linkElement).toBeInTheDocument();
});

test('renders the details panel when a flow is selected', async () => {
    const mockFlow = {
        flow: {
            flow: {
                case: 'httpFlow',
                value: {
                    id: '1',
                    request: {
                        method: 'GET',
                        url: 'http://example.com',
                        httpVersion: 'HTTP/1.1',
                        headers: {},
                        content: new Uint8Array(),
                    },
                    response: {
                        statusCode: 200,
                        httpVersion: 'HTTP/1.1',
                        headers: {},
                        content: new Uint8Array(),
                    },
                },
            },
        },
    };

    mockedCreateClient.mockReturnValue({
        streamFlows: async function* () {
            yield mockFlow;
            // Don't complete the stream
            await new Promise(() => { });
        },
        exportFlow: async function () {
            return Promise.resolve({ received: true, message: "ok", flowsProcessed: 0n });
        }
    } as unknown as ReturnType<typeof createClient>);

    render(<App />);

    const flowCell = await screen.findByRole('gridcell', { name: /http:\/\/example.com/i });
    fireEvent.click(flowCell.parentElement!); // Click the parent row

    const requestTab = await screen.findByRole('button', { name: /Request/i });
    expect(requestTab).toBeInTheDocument();
});

test('details panel is focusable for keyboard scrolling', async () => {
    const mockFlow = {
        flow: {
            flow: {
                case: 'httpFlow',
                value: {
                    id: '1',
                    request: {
                        method: 'GET',
                        url: 'http://example.com',
                        httpVersion: 'HTTP/1.1',
                        headers: {},
                        content: new Uint8Array(),
                    },
                    response: {
                        statusCode: 200,
                        httpVersion: 'HTTP/1.1',
                        headers: {},
                        content: new Uint8Array(),
                    },
                },
            },
        },
    };

    mockedCreateClient.mockReturnValue({
        streamFlows: async function* () {
            yield mockFlow;
            await new Promise(() => { });
        },
        exportFlow: async function () {
            return Promise.resolve({ received: true, message: "ok", flowsProcessed: 0n });
        }
    } as unknown as ReturnType<typeof createClient>);

    render(<App />);

    const flowCell = await screen.findByRole('gridcell', { name: /http:\/\/example.com/i });
    fireEvent.click(flowCell.parentElement!);

    // Details panel should now exist and be focusable
    const detailsRegion = await screen.findByRole('region', { name: /Flow Details/i });
    expect(detailsRegion).toBeInTheDocument();
    expect(detailsRegion).toHaveAttribute('tabIndex', '0');

    // Click to focus
    fireEvent.mouseDown(detailsRegion);
    detailsRegion.focus();
    expect(document.activeElement).toBe(detailsRegion);

    // ArrowDown should NOT throw and default behavior should occur (jsdom won't scroll, but we ensure no preventDefault interference here)
    const keyEvent = new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true });
    const dispatchResult = detailsRegion.dispatchEvent(keyEvent);
    expect(dispatchResult).toBe(true); // Event not canceled by preventDefault
});

test('adds flows to the list', async () => {
    const mockFlow = {
        flow: {
            flow: {
                case: 'httpFlow',
                value: {
                    id: '1',
                    request: {
                        method: 'GET',
                        url: 'http://example.com',
                        httpVersion: 'HTTP/1.1',
                        headers: {},
                        content: new Uint8Array(),
                    },
                    response: {
                        statusCode: 200,
                        httpVersion: 'HTTP/1.1',
                        headers: {},
                        content: new Uint8Array(),
                    },
                },
            },
        },
    };

    mockedCreateClient.mockReturnValue({
        streamFlows: async function* () {
            yield mockFlow;
            // Don't complete the stream
            await new Promise(() => { });
        },
        exportFlow: async function () {
            return Promise.resolve({ received: true, message: "ok", flowsProcessed: 0n });
        }
    } as unknown as ReturnType<typeof createClient>);

    render(<App />);

    const flowCell = await screen.findByRole('gridcell', { name: /http:\/\/example.com/i });
    expect(flowCell).toBeInTheDocument();
});

test('clicking a row focuses but does not select it, while ctrl-click selects', async () => {
    const mockFlow1 = {
        flow: {
            flow: {
                case: 'httpFlow',
                value: {
                    id: '1',
                    request: { url: 'http://example.com/1', method: 'GET', httpVersion: 'HTTP/1.1', headers: {}, content: new Uint8Array() },
                    response: { statusCode: 200, httpVersion: 'HTTP/1.1', headers: {}, content: new Uint8Array() },
                },
            },
        },
    };
    const mockFlow2 = {
        flow: {
            flow: {
                case: 'httpFlow',
                value: {
                    id: '2',
                    request: { url: 'http://example.com/2', method: 'GET', httpVersion: 'HTTP/1.1', headers: {}, content: new Uint8Array() },
                    response: { statusCode: 200, httpVersion: 'HTTP/1.1', headers: {}, content: new Uint8Array() },
                },
            },
        },
    };

    mockedCreateClient.mockReturnValue({
        streamFlows: async function* () {
            yield mockFlow1;
            yield mockFlow2;
            await new Promise(() => { });
        },
        exportFlow: async function () {
            return Promise.resolve({ received: true, message: "ok", flowsProcessed: 0n });
        }
    } as unknown as ReturnType<typeof createClient>);

    render(<App />);

    const row1 = await screen.findByText(/http:\/\/example.com\/1/i);
    const row2 = await screen.findByText(/http:\/\/example.com\/2/i);

    const tr1 = row1.closest('tr');
    const tr2 = row2.closest('tr');

    expect(tr1).toBeInTheDocument();
    expect(tr2).toBeInTheDocument();

    const checkbox1 = tr1!.querySelector('input[type="checkbox"]') as HTMLInputElement;
    const checkbox2 = tr2!.querySelector('input[type="checkbox"]') as HTMLInputElement;

    expect(checkbox1).toBeInTheDocument();
    expect(checkbox2).toBeInTheDocument();

    // 1. Simple click on first row
    fireEvent.click(tr1!);

    // Row 1 should be focused (details panel shown), but not selected
    expect(await screen.findByText('Request')).toBeInTheDocument();
    expect(checkbox1.checked).toBe(false);
    expect(checkbox2.checked).toBe(false);

    // 2. Ctrl-click on first row
    fireEvent.click(tr1!, { ctrlKey: true });

    // Row 1 should be selected
    expect(checkbox1.checked).toBe(true);
    expect(checkbox2.checked).toBe(false);

    // 3. Simple click on second row
    fireEvent.click(tr2!);

    // Row 2 should be focused, and selection should be cleared
    expect(await screen.findByText('Request')).toBeInTheDocument(); // Details panel should update
    expect(checkbox1.checked).toBe(false);
    expect(checkbox2.checked).toBe(false);
});
