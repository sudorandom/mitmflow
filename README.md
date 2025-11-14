# mitmflow

`mitmflow` is a tool for inspecting and analyzing network traffic. It consists of a `mitmproxy` addon that captures traffic and a web interface for viewing and analyzing it.

## Features

*   **Real-time traffic inspection:** View HTTP, DNS, TCP, and UDP flows in real-time.
*   **Detailed flow analysis:** Inspect flow details, including headers, bodies, and connection information.
*   **Extensible:** The `mitmproxy` addon can be customized to support additional protocols and features.

## Getting Started

### Prerequisites

*   [mitmproxy](https://mitmproxy.org/)
*   [Go](https://golang.org/)
*   [pnpm](https://pnpm.io/)
*   [mise](https://mise.jdx.dev/)

### Installation

1.  **Install the `mitmproxy` addon:**

    ```bash
    pip install .
    ```

2.  **Install the web interface dependencies:**

    ```bash
    pnpm install
    ```

### Running mitmflow

1.  **Start the `mitmflow` server:**

    ```bash
    go run .
    ```

2.  **Start the `mitmproxy` addon:**

    ```bash
    mitmweb -s grpc_addon.py --set grpc_addr=http://127.0.0.1:50051 --set grpc_events=all
    ```

    You can customize the gRPC server address and the event types to emit using the `grpc_addr` and `grpc_events` options. For example, to connect to a different gRPC server and only emit `request` and `response` events, you would use the following command:

    ```bash
    mitmweb -s grpc_addon.py --set grpc_addr=http://localhost:50052 --set grpc_events=request,response
    ```

3.  **Start the web interface:**

    ```bash
    pnpm dev
    ```

## Developer Guide

### Mise
All tooling is installed using [mise-en-place](https://mise.jdx.dev). This is a tool for installing specific versions of tools. This is used for tooling for Python, Go and Typescript and some other tooling like buf.

### Using `fauxrpc` for frontend development

For frontend development, you can use `fauxrpc` to test the web interface without running the `mitmflow` server or `mitmproxy`.

1.  **Start `fauxrpc`:**

    ```bash
    just fauxrpc
    ```

This creates a "fake" server which emits randomized responses useful for testing the frontend.

2.  **Start the web interface:**

    ```bash
    pnpm dev
    ```

This runs the frontend in a mode that will automatically pick up any changes are reflect it in the frontend.
