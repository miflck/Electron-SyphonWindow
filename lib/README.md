# p5.syphon

Publish p5.js canvases to other macOS apps (Resolume, MadMapper, VDMX, TouchDesigner, Syphon Simple Client, ...) through [Syphon](https://syphon.github.io/). Runs inside Electron and adds one function to p5: `drawSyphon()`.

```js
function draw() {
  background(20);
  circle(mouseX, mouseY, 80);

  drawSyphon();   // that's it
}
```

## Contents

- [Quick start](#quick-start)
- [API](#api)
- [Recipes](#recipes)
- [How it works](#how-it-works)
- [Limits and gotchas](#limits-and-gotchas)
- [Using it in another project](#using-it-in-another-project)
- [Troubleshooting](#troubleshooting)

## Quick start

1. Load the library after p5 and before your sketch:

   ```html
   <script src="./node_modules/p5/lib/p5.js"></script>
   <script src="./lib/p5.syphon.js"></script>
   <script src="./sketch.js"></script>
   ```

2. Call `drawSyphon()` at the end of `draw()`. Alternatively call `Syphon.auto("My Sketch")` once in `setup()` and leave `draw()` alone.

3. Set `pixelDensity()` **before** `createCanvas()`. Changing it afterwards recreates the canvas.

4. Run the app and pick your server name in the Syphon client. It may be listed under "Electron Helper".

Requirements: macOS, Electron with `nodeIntegration: true` and `contextIsolation: false` on the sketch window, and the compiled `syphon_addon.node` (see [Using it in another project](#using-it-in-another-project)).

## API

### `drawSyphon([target], [name])`

Publishes the current contents of a canvas. Call it once per frame, after drawing.

| Call | Publishes |
| --- | --- |
| `drawSyphon()` | the main canvas, server name `"p5"` |
| `drawSyphon("My Sketch")` | the main canvas, custom server name |
| `drawSyphon(pg)` | a `createGraphics()` buffer |
| `drawSyphon(pg, "Layer")` | a buffer under its own server name |
| `drawSyphon(canvasElement, "x")` | any `<canvas>` element |

Returns `true` if a frame was handed to Syphon. The server is created on the first call, one per name, so publishing several buffers is just several calls with different names. In instance mode it is a method on the sketch: `p.drawSyphon()`.

### `Syphon`

A global object for everything else.

| Member | Description |
| --- | --- |
| `Syphon.auto([name])` | Publish the main canvas after every frame, no change to `draw()`. Uses p5's `post` hook (p5 1.x). |
| `Syphon.setName(name)` | Default server name used when none is passed. |
| `Syphon.setEnabled(bool)` | Pause or resume. Disabling stops all servers. |
| `Syphon.stop([name])` | Stop one server, or all of them. They restart on the next `drawSyphon`. |
| `Syphon.enabled`, `Syphon.running` | Current state. |
| `Syphon.setAddonPath(path)` | Point to `syphon_addon.node` if it is not found automatically. |
| `Syphon.onChange(fn)` | Called with `{ running, names, name, error }` when servers start or stop. Returns an unsubscribe function. |
| `Syphon.useIpc([startEnabled])` | Let another Electron window toggle Syphon (see below). |

## Recipes

**Several outputs**

```js
function draw() {
  pg.background(0);
  pg.circle(mouseX, mouseY, 50);
  image(pg, 0, 0);

  drawSyphon("Main");
  drawSyphon(pg, "Layer");
}
```

**Toggle from a control window**

`Syphon.useIpc()` turns publishing off at start and listens for these messages:

| Message | Direction | Meaning |
| --- | --- | --- |
| `set-syphon` (bool) | to the sketch | start or stop |
| `request-syphon-state` | to the sketch | ask for the current state |
| `syphon-state` | from the sketch | `{ running, name, names, error }` |

The sketch window's `main.js` has to forward them from your control window; this repo's `main.js` and `control.html` show a working version.

**Show state in your own UI**

```js
Syphon.onChange(({ running, name, error }) => {
  status.textContent = error ? error : running ? `Publishing "${name}"` : "Off";
});
```

## How it works

```
p5 canvas -> readPixels / getImageData -> RGBA bytes -> native addon -> Syphon
```

- **WEBGL canvas:** `gl.readPixels` returns rows bottom-up, which is what Syphon expects.
- **P2D canvas:** `getImageData` returns rows top-down, so the addon is told to flip.
- **Native addon:** a small Node-API module (`syphon_addon.mm`). Electron renders in a separate GPU process, so there is no GL context to share. The addon creates its own offscreen CGL context, uploads each frame into a texture and publishes it with `SyphonOpenGLServer`. Frames are skipped while no client is connected.
- **Size:** the real pixel size (`canvas.width`) is used, so `pixelDensity(2)` publishes at double resolution.

The addon API, if you want to use it without p5:

```js
const { SyphonServerWrapper } = require("./build/Release/syphon_addon.node");
const server = new SyphonServerWrapper("Name");
server.publishFrame(rgbaUint8Array, width, height, flipped = false);
server.stop();
```

## Limits and gotchas

- **Cost:** every frame is a GPU to CPU to GPU round trip. About 8 MB per frame at 1080p is fine at 60 fps on a recent Mac. 4K can become the bottleneck.
- **Alpha:** WebGL `readPixels` returns premultiplied alpha. Transparent backgrounds can show dark fringes in some clients. Draw on an opaque background if that matters.
- **One main canvas:** only `drawSyphon()` without a target publishes it. Other buffers must be passed explicitly.
- **Hidden windows:** the window must keep rendering. Set `backgroundThrottling: false` on the `BrowserWindow` and the Chromium switches `disable-renderer-backgrounding`, `disable-backgrounding-occluded-windows` and `disable-background-timer-throttling`.
- **Resizing:** `resizeCanvas()` works; the texture is reallocated when the size changes.
- **Not sandboxable:** Syphon cannot be used in a Mac App Store build.
- **Architecture:** the bundled `Syphon.framework` is arm64 only.
- **OpenGL:** `SyphonOpenGLServer` uses OpenGL, which Apple has deprecated but still ships.

## Using it in another project

Copy these into your project:

```
lib/p5.syphon.js
native/syphon_addon.mm
binding.gyp
frameworks/Syphon.framework
```

Add to `package.json`:

```json
"dependencies": { "bindings": "^1.5.0", "node-addon-api": "^3.0.0" },
"devDependencies": { "node-gyp": "^9.0.0" },
"scripts": { "install": "node-gyp rebuild" }
```

Then run `npm install`. The library looks for the addon in this order and uses the first that loads:

1. the path given to `Syphon.setAddonPath()`
2. the `SYPHON_ADDON_PATH` environment variable
3. `syphon_addon.node` next to `p5.syphon.js`
4. `../build/Release/syphon_addon.node` relative to `p5.syphon.js`
5. `build/Release/syphon_addon.node` in the working directory

For packaged builds (framework location, asar unpacking, signing) see [PORTING.md](../docs/PORTING.md).

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `syphon_addon.node not found` in the console | Run `node-gyp rebuild`, or call `Syphon.setAddonPath()`. |
| Server not listed in the client | Check it is enabled (`Syphon.enabled`) and that `drawSyphon()` actually runs each frame. With `useIpc()`, press Start first. |
| Black frames | Reconnect the client after restarting the app. A stale connection can stay black. |
| Image upside down | You passed a P2D canvas through your own code with the wrong flip. Use `drawSyphon()`, which picks the right one. |
| `Cannot read properties of undefined (reading 'whenReady')` | VS Code sets `ELECTRON_RUN_AS_NODE`. Start with `env -u ELECTRON_RUN_AS_NODE electron .`. |
| Output stops when the window is hidden | See "Hidden windows" above. |
