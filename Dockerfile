# Dockerfile for GoReleaser
# The binary is pre-built by GoReleaser and passed to this build context
FROM alpine:latest

WORKDIR /app

# Install ca-certificates for HTTPS
RUN apk --no-cache add ca-certificates

# Copy pre-built binary from GoReleaser context (includes platform-specific binaries)
ARG TARGETPLATFORM
COPY $TARGETPLATFORM/mitmflow /app/mitmflow

# Expose the default port
EXPOSE 50051

# Create non-root user
RUN addgroup -g 1000 mitmflow && \
    adduser -D -u 1000 -G mitmflow mitmflow && \
    chown -R mitmflow:mitmflow /app

USER mitmflow

ENTRYPOINT ["/app/mitmflow"]
CMD ["--addr=0.0.0.0:50051"]
