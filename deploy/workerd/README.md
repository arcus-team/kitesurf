# Kitesurf on workerd alone

A container image that runs the engine on [workerd](https://github.com/cloudflare/workerd)
without wrangler, Node, esbuild, or `node_modules` at runtime: one process, ~130 MiB idle
(`wrangler dev` idles at ~650 MiB).

```bash
docker build -f deploy/workerd/Dockerfile -t kitesurf-workerd .
docker run --rm -p 127.0.0.1:8787:8787 kitesurf-workerd
# CDP: ws://127.0.0.1:8787/devtools/browser   health: http://127.0.0.1:8787/health
```

## How it is built

`build-context.sh <ctx>` (run inside the Dockerfile's build stage):

1. `bazel run //packages/engine:dev_build` stages the wasm modules and bundles.
2. `wrangler deploy --dry-run --outdir <ctx>/bundle` produces exactly what `wrangler deploy`
   would upload: `index.js` plus the wasm and text modules.
3. `gen-config.mjs` writes `<ctx>/config.capnp`, a standalone workerd config:
   - the bundle's modules (`index.js` ES module, `*.wasm`, and `*.glue.js`/`*.css`/`*.dat` as
     text, per the `rules` in `packages/engine/wrangler.jsonc`);
   - the production `vars` of `wrangler.jsonc` as text bindings. A `KITESURF_*` or
     `WEB_BOT_AUTH_*` environment variable set when generating overrides its var;
   - `LOADER` as a worker loader (the per-page Dynamic Workers);
   - `FONT_ASSETS` as a read-only disk service over `public/`;
   - `WEB_BOT_AUTH_JWK` from the container environment at runtime (a secret, never in the
     config);
   - one HTTP socket on `*:8787` and public-internet egress.
4. The workerd binary pinned by the lockfile is copied next to it.

Cap'n Proto resolves `embed` paths relative to the config file, so `gen-config.mjs` writes them
relative to the current directory: run it from the directory the config is written to.

## Notes

- Bazel runs with `--spawn_strategy=processwrapper-sandbox,local`: `linux-sandbox` needs
  namespaces a container build doesn't have, and fully unsandboxed builds race in rules_rust
  ("output file ... is not writeable").
- The CDP endpoint has no authentication. Expose it only inside a private network.
