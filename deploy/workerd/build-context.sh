#!/usr/bin/env bash
# Builds the engine and assembles a Docker build context that runs it on workerd alone:
#   <ctx>/bundle/        wrangler's deployable bundle (index.js + wasm/text modules)
#   <ctx>/public/        static assets the engine reads through FONT_ASSETS
#   <ctx>/config.capnp   standalone workerd config (deploy/workerd/gen-config.mjs)
#   <ctx>/workerd        the workerd binary pinned by the repo's lockfile
#
#   deploy/workerd/build-context.sh <ctx-dir>
# Needs: bazel (bazelisk), Node 22+, pnpm 9.15.4, and `pnpm install --frozen-lockfile` done.
# BAZEL_ARGS is passed to `bazel run` (the Dockerfile uses --spawn_strategy=processwrapper-sandbox,local).
set -euo pipefail

ctx=$(realpath -m "${1:?usage: build-context.sh <ctx-dir>}")
repo=$(cd "$(dirname "$0")/../.." && pwd)
engine="$repo/packages/engine"

rm -rf "$ctx" && mkdir -p "$ctx"

# Stage the wasm modules and page/renderer bundles where wrangler reads them.
(cd "$repo" && bazel run ${BAZEL_ARGS:-} //packages/engine:dev_build)

# The deployable bundle, exactly as `wrangler deploy` would upload it.
(cd "$engine" && ./node_modules/.bin/wrangler deploy --dry-run --outdir "$ctx/bundle" -c wrangler.jsonc)
rm -f "$ctx/bundle/"*.map "$ctx/bundle/README.md"

cp -r "$engine/public" "$ctx/public"

# The workerd release pinned by the lockfile (the one wrangler/miniflare run in development).
workerd=$(ls -d "$repo"/node_modules/.pnpm/@cloudflare+workerd-linux-64@*/node_modules/@cloudflare/workerd-linux-64/bin/workerd | sort -V | tail -1)
cp "$workerd" "$ctx/workerd"

# Embed paths are relative to the config, so generate it from inside the context; the disk
# service serves assets from /app/public, where the Dockerfile copies them.
(cd "$ctx" && node "$repo/deploy/workerd/gen-config.mjs" bundle /app/public > config.capnp)

echo "context ready: $ctx ($(du -sh "$ctx" | cut -f1))"
