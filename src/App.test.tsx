import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, test, expect, beforeEach } from 'vitest';
import App from './App';
import { createClient } from '@connectrpc/connect';
import { Flow } from './gen/mitmflow/v1/mitmflow_pb';
import useFilterStore from './store';

// Mock the connect client
vi.mock('@connectrpc/connect');
const mockedCreateClient = vi.mocked(createClient);

// Mock data as plain objects
const mockHttpFlow = (id: string, url: string): Flow => ({
    flow: {
        case: 'httpFlow',
        value: {
            id,
            request: {
                method: 'GET',
                url,
                prettyUrl: url,
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
            durationMs: 123,
            timestampStart: { seconds: BigInt(Math.floor(Date.now() / 1000)), nanos: 0 },
        },
    },
});

const setupMockClient = (flows: Flow[] = []) => {
    mockedCreateClient.mockReturnValue({
        streamFlows: async function* () {
            for (const flow of flows) {
                yield { flow };
            }
            // Keep the stream open
            await new Promise(() => { });
        },
    } as unknown as ReturnType<typeof createClient>);
};

beforeEach(() => {
    // Reset the store before each test
    useFilterStore.setState({
        text: '',
        flowTypes: [],
        http: {
            methods: [],
            contentTypes: [],
            statusCodes: [],
        },
    });
});

test('renders the main app component and an empty table', async () => {
    setupMockClient([]);
    render(<App />);
    expect(screen.getByRole('heading', { name: /Flows/i })).toBeInTheDocument();
    // Wait for the table to render its empty state message
    expect(await screen.findByText('No rows to display')).toBeInTheDocument();
});

test('adds a single flow to the table', async () => {
    const flow = mockHttpFlow('1', 'http://example.com/test');
    setupMockClient([flow]);

    render(<App />);

    // Check that the flow appears in the table by looking for the cell content
    const cell = await screen.findByRole('cell', { name: /http:\/\/example.com\/test/i });
    expect(cell).toBeInTheDocument();
});

test('renders the details panel when a flow is clicked', async () => {
    const flow = mockHttpFlow('1', 'http://example.com/details');
    setupMockClient([flow]);

    render(<App />);

    // Wait for the row to appear and click it
    const row = await screen.findByRole('cell', { name: /http:\/\/example.com\/details/i });
    fireEvent.click(row);

    // Check that the details panel is now visible
    await waitFor(() => {
        expect(screen.getByRole('tab', { name: /Request/i })).toBeInTheDocument();
    });
});

test('filters flows based on the search input', async () => {
    const flows = [
        mockHttpFlow('1', 'http://example.com/one'),
        mockHttpFlow('2', 'http://another.com/two'),
    ];
    setupMockClient(flows);

    render(<App />);

    // Ensure both flows are initially visible
    await screen.findByRole('cell', { name: /http:\/\/example.com\/one/i });
    await screen.findByRole('cell', { name: /http:\/\/another.com\/two/i });

    // Apply a filter
    const filterInput = screen.getByPlaceholderText(/Filter flows.../i);
    fireEvent.change(filterInput, { target: { value: 'another.com' } });

    // Check that only the matching flow is visible
    await waitFor(() => {
        expect(screen.queryByRole('cell', { name: /http:\/\/example.com\/one/i })).not.toBeInTheDocument();
        expect(screen.getByRole('cell', { name: /http:\/\/another.com\/two/i })).toBeInTheDocument();
    });
});
