# ---- Build stage ----
FROM denoland/deno:2.7.4 AS builder

WORKDIR /app

# Cache dependencies
COPY deno.json ./
COPY src/ ./src/
RUN deno cache src/main.ts

# ---- Runtime stage (Deno distroless) ----
FROM denoland/deno:distroless

WORKDIR /app

# Copy application
COPY --from=builder /app /app

# Copy Deno module cache (DENO_DIR in official images is /deno-dir)
COPY --from=builder /deno-dir /deno-dir

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["/usr/bin/deno", "eval", "--allow-net", \
    "const r = await fetch('http://localhost:8000/health'); if (!r.ok) Deno.exit(1);"]

CMD ["run", "--allow-net", "--allow-env", "src/main.ts"]
