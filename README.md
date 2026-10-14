# p5.js + Electron + Syphon

Renders a p5.js (WEBGL) sketch in Electron and publishes the canvas to other apps on macOS via [Syphon](https://syphon.github.io/) (Resolume, MadMapper, VDMX, Syphon Simple Client, ...).

The sketch window is only needed for debugging. The app keeps publishing while that window is hidden or covered.

## Requirements

- macOS (Apple Silicon; the bundled Syphon framework is arm64)
- Node.js and npm
- Xcode command line tools (to build the native addon)

## Setup

```sh
npm install
```

`npm install` also runs `node-gyp rebuild`, which builds the native addon `build/Release/syphon_addon.node`. After changing `native/syphon_addon.mm`, rebuild with:

```sh
node-gyp rebuild
```

## Run

```sh
npm start
```

From the VS Code integrated terminal use this instead:

```sh
npm run start:vscode
```

VS Code sets `ELECTRON_RUN_AS_NODE=1`, which makes Electron behave like plain Node and fail with `Cannot read properties of undefined (reading 'whenReady')`. The `start:vscode` script unsets it.

## Usage

The app opens a small **Syphon Control** window:

| Control | Action |
| --- | --- |
| Start Syphon / Stop Syphon | Creates or stops the Syphon server `P5JsElectronApp` |
| Show window / Hide window | Shows or hides the p5 sketch window (hidden by default) |
| Toggle DevTools | Opens or closes DevTools for the sketch window |

- Cmd+Shift+D also toggles the sketch window (global shortcut).
- Closing the sketch window only hides it. Closing the control window quits the app.
- In your Syphon client, pick **P5JsElectronApp** (it may be listed under "Electron Helper").

## How it works

- `main.js` creates the control window and a hidden render window, and relays button presses over IPC. Background throttling is disabled so the sketch keeps running while hidden.
- `lib/p5.syphon.js` is the reusable part. It adds `drawSyphon()` to p5, reads the canvas (`readPixels` for WEBGL, `getImageData` for P2D) and passes it to the addon. See [lib/README.md](lib/README.md).
- `native/syphon_addon.mm` is a Node-API addon. Electron renders in a separate GPU process, so the renderer has no GL context to share. The addon creates its own offscreen CGL context, uploads each frame into a texture and publishes it with `SyphonOpenGLServer`. Frames are skipped while no client is connected.

The addon API:

```js
const server = new SyphonServerWrapper("Name");
server.publishFrame(rgbaUint8Array, width, height, flipped = false);
server.stop();
```

## Your own sketch

Edit `src/sketch.js`. Call `drawSyphon()` at the end of `draw()` and set `pixelDensity()` before `createCanvas`. See [lib/README.md](lib/README.md) for the full API; it works with P2D and WEBGL canvases and `createGraphics()` buffers.

## Project layout

```
main.js             Electron main process, windows and IPC
ui/                 index.html (sketch window), control.html (control window)
lib/p5.syphon.js    Reusable Syphon library (drawSyphon)
src/sketch.js       p5 sketch
native/             syphon_addon.mm, the native Syphon addon
binding.gyp         node-gyp build config
frameworks/         Syphon.framework
resources/          App icon, entitlements, unused web icons
docs/               PORTING.md
scripts/            Universal-binary build helper
```

## Build a distributable

```sh
npm run build
```

Output goes to `dist/`.

## Troubleshooting

- **Black frame in the client:** reconnect the client after restarting the app. A stale connection to an old server can stay black.
- **Server not listed:** press **Start Syphon**. The server is not created at launch.
- **Addon fails to load:** run `node-gyp rebuild` and check that `frameworks/Syphon.framework` exists.
