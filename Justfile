frontend-build:
    pnpm install
    pnpm i baseline-browser-mapping@latest -D
    pnpm build

frontend-dev:
    pnpm install
    pnpm dev

backend-dev:
    go run .

dev:
    bash scripts/dev.sh

dev-fauxrpc:
    USE_FAUXRPC=1 bash scripts/dev.sh

generate:
    cd proto; buf generate --template=go.gen.yaml
    cd proto; buf generate --template=ts.gen.yaml

gen-images:
    magick stubs/data/test.svg -resize 20x20 stubs/data/test.png
    cat stubs/data/test.png | base64 -o stubs/data/test.png.b64
    magick stubs/data/test.svg -resize 20x20 stubs/data/test.jpg
    cat stubs/data/test.jpg | base64 -o stubs/data/test.jpg.b64
    magick stubs/data/test.svg -resize 20x20 stubs/data/test.webp
    cat stubs/data/test.webp | base64 -o stubs/data/test.webp.b64

fauxrpc-image:
    cd proto && buf build -o ../fauxrpc-image.binpb

fauxrpc: fauxrpc-image
    fauxrpc run \
        --schema=fauxrpc-image.binpb \
        --addr=127.0.0.1:50051 \
        --stubs=stubs

fauxrpc-client: fauxrpc-image
    ./send_test_flows.sh 0.1
