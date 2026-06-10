# Vendored DuckDB-WASM

Pinned version: `@duckdb/duckdb-wasm@1.32.0` (EH / single-thread bundle).
Files: duckdb-browser.mjs, duckdb-browser-eh.worker.js, duckdb-eh.wasm.

Re-vendor: bump VER in the curl block in docs/superpowers/plans/2026-06-08-real-data-ingestion.md Task 8
and re-run it. The EH (exception-handling, single-thread) bundle is used deliberately so no
COOP/COEP cross-origin-isolation headers are required on the static host.

## apache-arrow (peer dependency — also vendored here)

`duckdb-browser.mjs` does `import * as ... from "apache-arrow"` — a bare specifier DuckDB-WASM
expects a bundler to resolve. This repo has **no build step**, so we instead vendor a single,
fully self-contained Arrow ESM bundle and resolve the bare specifier with an **import map**.

- File: `apache-arrow.mjs` — `apache-arrow@17.0.0` (DuckDB-WASM 1.32.0 requires `^17.0.0`).
- Source: `https://esm.sh/apache-arrow@17.0.0/es2022/apache-arrow.bundle.mjs` (the `?bundle-deps`
  output — all transitive deps inlined; verified to contain **no external imports and no CDN/esm.sh
  URLs**, so it serves fully same-origin).

Any HTML page that loads the engine modules MUST declare this import map **before** the engine
`<script>`/module loads:

```html
<script type="importmap">
{ "imports": { "apache-arrow": "./vendor/duckdb/apache-arrow.mjs" } }
</script>
```

The path is relative to the document base URL (so it works at site root and under a project
subpath like GitHub Pages `/<repo>/`). Re-vendor Arrow by re-downloading the same esm.sh URL with
a version matching DuckDB-WASM's `apache-arrow` peer-dependency range.

## After re-vendoring: strip sourcemap pointers

We do **not** vendor the `.map` sourcemap files (they're debug-only and the Arrow one would point
at an esm.sh-named map). Each downloaded module ends with a `//# sourceMappingURL=…` comment that
would otherwise 404 in devtools. Strip that trailing comment from all three modules so the console
stays clean and strictly same-origin:

```bash
node -e "const fs=require('fs');for(const f of ['vendor/duckdb/duckdb-browser.mjs','vendor/duckdb/duckdb-browser-eh.worker.js','vendor/duckdb/apache-arrow.mjs']){const s=fs.readFileSync(f,'utf8');fs.writeFileSync(f,s.replace(/\r?\n?\/\/[#@][ \t]*sourceMappingURL=\S*[ \t\r\n]*$/,'')+'\n');}"
```

This removes only an inert trailing comment; the module code is unchanged.
