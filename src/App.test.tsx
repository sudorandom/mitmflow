import { render, screen, fireEvent } from '@testing-library/react';
import { vi, test, expect } from 'vitest';
import App from './App';
import { createClient } from '@connectrpc/connect';

vi.mock('@connectrpc/connect');

const mockedCreateClient = vi.mocked(createClient);

import { Client, Service } from './gen/mitmflow/v1/mitmflow_pb';

test('renders the main app component', () => {
    mockedCreateClient.mockReturnValue({
        streamFlows: async function* () {
            // empty stream by default
        },
    } as Client<typeof Service>);
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
    } as Client<typeof Service>);

    render(<App />);

    const flowRow = await screen.findByText(/http:\/\/example.com/i);
    fireEvent.mouseDown(flowRow);

    const detailsPanel = screen.getByRole('heading', { name: /Request/i });
    expect(detailsPanel).toBeInTheDocument();
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
    } as Client<typeof Service>);

    render(<App />);

    const flowRow = await screen.findByText(/http:\/\/example.com/i);
    expect(flowRow).toBeInTheDocument();
});
