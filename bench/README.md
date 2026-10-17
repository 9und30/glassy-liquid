# Benchmark

`npm run bench` compares glassy-liquid with `@glass-sdk/liquid-glass` in headless Chrome (GPU and WebGPU, nothing shown on screen) and writes `bench/results.json` plus `docs/public/bench.json`.

The third-party bundles used for the gzip size row are not committed. They are built from the version pinned in `bench/competitor/package.json`:

```sh
npm run bench:competitor
```

That installs `bench/competitor` from its lockfile and writes `dom.bundle.js` and `react.bundle.js` (both gitignored). `npm run bench` runs the same build when those files or `node_modules` are missing.

Needs a Chrome install Playwright can launch (`channel: chrome`). Override with `CHANNEL` if you use a different channel. `REPS`, `CASES`, `LIBS`, and `N` match the variables read by `bench/run.mjs`.
