import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, test, expect, beforeEach, afterEach } from 'vitest';
import App from './App';
import { createClient } from '@connectrpc/connect';
import { agTestIdFor } from 'ag-grid-community';

vi.mock('@connectrpc/connect');

const mockedCreateClient = vi.mocked(createClient);

let container: HTMLDivElement;

beforeEach(() => {
  // Create a container with a fixed size for the grid to render in
  container = document.createElement('div');
  container.style.width = '1000px';
  container.style.height = '1000px';
  document.body.appendChild(container);
});

afterEach(() => {
  // Cleanup the container
  document.body.removeChild(container);
});

const mockFlow = {
    flow: {
        flow: {
            case: 'httpFlow',
            value: {
                id: '1',
                request: {
                    method: 'GET',
                    url: 'http://example.com',
                    prettyUrl: 'http://example.com',
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

test('renders the main app component', () => {
    mockedCreateClient.mockReturnValue({
        streamFlows: async function* () {
            // empty stream by default
        },
    } as unknown as ReturnType<typeof createClient>);
    render(<App />, { container });
    const linkElement = screen.getByRole('heading', { name: /Flows/i });
    expect(linkElement).toBeInTheDocument();
});

test('renders the details panel when a flow is selected', async () => {
    mockedCreateClient.mockReturnValue({
        streamFlows: async function* () {
            yield mockFlow;
            // Don't complete the stream
            await new Promise(() => { });
        },
    } as unknown as ReturnType<typeof createClient>);

    render(<App />, { container });

    // Wait for the grid to render the rows
    const grid = await screen.findByTestId('flow-grid');
    const dataRows = await screen.findAllByRole('row');

    // The first row is the header, so we click the second one
    fireEvent.click(dataRows[1]);

    const requestTab = await screen.findByRole('button', { name: /Request/i });
    expect(requestTab).toBeInTheDocument();
});

test('adds flows to the list', async () => {
    mockedCreateClient.mockReturnValue({
        streamFlows: async function* () {
            yield mockFlow;
            // Don't complete the stream
            await new Promise(() => { });
        },
    } as unknown as ReturnType<typeof createClient>);

    render(<App />, { container });

    // Wait for the rows to appear in the grid
    await waitFor(() => {
      const grid = screen.getByTestId('flow-grid');
      const rows = screen.getAllByRole('row', { container: grid });
      // The grid should have a header row and one data row
      expect(rows).toHaveLength(2);
    });
});
