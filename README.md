# visualise

A [Paseo](https://paseo.sh) plugin that edits [tldraw](https://tldraw.dev) drawings (`.tldr`) in your workspace, with a one-way "Send to tldraw.com" copy. See [OVERVIEW.md](OVERVIEW.md) for what it does.

## Develop

```sh
npm install
npm run build:dev   # tldraw runtime, development mode (no licence key needed)
npm run typecheck
npm test
paseo plugin install "$PWD"
```

`npm run build` makes the production runtime, which needs a tldraw licence key (Settings, Plugins, Visualise). Generated files (`server/*.gen.ts`) are not committed; Git installs build them through the manifest `build` step.

## Layout

- `runtime-src/`: the tldraw app that runs in a sandboxed iframe (bundled by `scripts/build-runtime.mjs`).
- `client/`: file panel, Visualise panel, save queue, iframe mount.
- `server/`: drawing file IO with a workspace path guard, runtime chunks, the one-time tldraw.com import route.
- `shared/`: RPC, iframe protocol and settings contracts.

Parts of the iframe mount, runtime build, path guard and file IO are adapted from [lerenn/paseo-excalidraw](https://github.com/lerenn/paseo-excalidraw) (MIT).

## Licence

The plugin code is MIT. tldraw is under the [tldraw licence](https://github.com/tldraw/tldraw/blob/main/LICENSE.md); production use needs a key from tldraw.
