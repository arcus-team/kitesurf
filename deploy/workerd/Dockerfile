# Kitesurf on workerd alone: no wrangler, Node, or node_modules at runtime.
#   docker build -f deploy/workerd/Dockerfile -t kitesurf-workerd .
# Runtime: listens on :8787 (CDP at ws://<host>:8787/devtools/browser, /health);
# WEB_BOT_AUTH_JWK (optional secret) is read from the environment.

# --- build: engine bundle + standalone workerd config (deploy/workerd/build-context.sh) ---
FROM node:22.11.0-bookworm AS build
ARG BAZELISK_VERSION=v1.26.0
RUN curl -fsSL -o /usr/local/bin/bazel \
      "https://github.com/bazelbuild/bazelisk/releases/download/${BAZELISK_VERSION}/bazelisk-linux-amd64" \
 && chmod +x /usr/local/bin/bazel \
 && npm install --global pnpm@9.15.4
WORKDIR /src
COPY . .
RUN pnpm install --frozen-lockfile
# linux-sandbox needs namespaces a container build lacks: sandbox with processwrapper
# (unsandboxed rules_rust races on read-only outputs), local only for actions that opt out
# of sandboxing (npm lifecycle hooks).
RUN BAZEL_ARGS=--spawn_strategy=processwrapper-sandbox,local deploy/workerd/build-context.sh /ctx

# --- runtime ---
FROM debian:bookworm-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl \
 && rm -rf /var/lib/apt/lists/* \
 && useradd --system --uid 10001 --home /app kitesurf
WORKDIR /app
COPY --from=build /ctx/workerd /usr/local/bin/workerd
COPY --from=build /ctx/bundle/ /app/bundle/
COPY --from=build /ctx/public/ /app/public/
COPY --from=build /ctx/config.capnp /app/config.capnp
USER 10001
EXPOSE 8787
HEALTHCHECK --interval=15s --timeout=3s CMD curl -fsS http://127.0.0.1:8787/health || exit 1
ENTRYPOINT ["/usr/local/bin/workerd", "serve", "--experimental", "/app/config.capnp"]
