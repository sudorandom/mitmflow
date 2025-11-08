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

    const flowRow = await screen.findByText(/http:\/\/example.com/i);
    fireEvent.mouseDown(flowRow);

    const requestTab = screen.getByRole('button', { name: /Request/i });
    expect(requestTab).toBeInTheDocument();
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

    const flowRow = await screen.findByText(/http:\/\/example.com/i);
    expect(flowRow).toBeInTheDocument();
});
