#!/bin/bash
set -e

# Default sleep duration
SLEEP_DURATION=${1:-1}

# Ensure buf and fauxrpc are available
export PATH=$HOME/bin:$HOME/go/bin:$PATH

echo "Sending flows to localhost:50051 every ${SLEEP_DURATION}s..."

generate_data() {
    while true; do
        fauxrpc generate \
            --schema=schema.binpb \
            --target=mitmproxy.v1.ExportFlowRequest \
            --stubs=stubs/input 2>/dev/null
        sleep "$SLEEP_DURATION"
    done
}

generate_data | buf curl \
    --http2-prior-knowledge \
    --schema schema.binpb \
    --protocol grpc \
    --data @- \
    http://127.0.0.1:50051/mitmproxy.v1.Service/ExportFlow
