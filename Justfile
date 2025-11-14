
gen-images:
    magick stubs/data/test.svg -resize 20x20 stubs/data/test.png
    cat stubs/data/test.png | base64 -o stubs/data/test.png.b64
    magick stubs/data/test.svg -resize 20x20 stubs/data/test.jpg
    cat stubs/data/test.jpg | base64 -o stubs/data/test.jpg.b64
    magick stubs/data/test.svg -resize 20x20 stubs/data/test.webp
    cat stubs/data/test.webp | base64 -o stubs/data/test.webp.b64

fauxrpc:
    fauxrpc run --schema=proto --addr=127.0.0.1:50051 --stubs=stubs/
