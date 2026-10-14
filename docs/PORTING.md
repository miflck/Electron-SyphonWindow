# Porting this to other sketches and Electron apps

## Short answer

- **Any p5 sketch:** possible, with small changes. The sketch must run inside this Electron app, and the Syphon code can be moved out of the sketch into one reusable file.
- **Any other Electron app:** possible. You need the native addon, the Syphon framework, and a way to get pixels from your app into `publishFrame()`.

The two parts are independent:

```
[ pixel source ]  ->  RGBA bytes + width + height  ->  [ native addon ]  ->  Syphon
 (canvas, page)                                          (syphon_addon.mm)
```

Porting means changing the left side. The addon stays the same.

---

## 1. Port any p5 script into this app

### What the sketch has to satisfy

| Requirement | Why |
| --- | --- |
| Runs in the Electron renderer (`index.html`) | The addon is loaded with `require`, which needs `nodeIntegration` |
| `pixelDensity()` is set **before** `createCanvas()` | Changing it afterwards recreates the canvas and the GL context |
| One main canvas | Only that canvas is published |
| Global mode, or instance mode with the canvas passed in | See the helper below |

### Step 1: load the library

The Syphon code now lives in `lib/p5.syphon.js`. Load it after p5 in `index.html` and call `drawSyphon()` at the end of `draw()` (or `Syphon.auto()` once in `setup()`). See [lib/README.md](lib/README.md).

### Step 2: canvas types

`drawSyphon()` handles both automatically: `readPixels` for WEBGL (bottom-up rows) and `getImageData` for P2D (top-down rows, sent with `flipped = true`). The addon's `publishFrame(data, w, h, flipped)` takes the flag as an optional fourth argument. It uses `canvas.width` / `canvas.height`, the real pixel size.

### Known limits for p5 sketches

- **Alpha:** `readPixels` returns premultiplied alpha when the context has `premultipliedAlpha: true` (the default). `getImageData` returns straight alpha. Sketches with transparent backgrounds may show dark fringes in some clients. Fix by unpremultiplying, or by drawing on an opaque background.
- **Multiple canvases:** `createGraphics()` buffers are not published. To send one, read its own context. To send several, create one server per buffer with a different name.
- **Resolution changes:** the addon reallocates its texture when width or height changes, so `resizeCanvas()` works.
- **Cost:** every frame is a GPU to CPU to GPU round trip. A 1920x1080 frame is about 8 MB, which is fine at 30 to 60 fps on a recent Mac, but expect it to become the bottleneck at 4K.
- **Not p5-specific:** nothing in the addon depends on p5. Any canvas works (three.js, Pixi, raw WebGL).

### Checklist

1. Copy your sketch into `src/`.
2. Remove any `createCanvas` pixel-density change after creation.
3. Make sure `drawSyphon()` runs once per frame (call it, or use `Syphon.auto()`).
4. `npm run start:vscode`, press **Start Syphon**, connect a client.

---

## 2. Port Syphon to another Electron app

### What to copy

```
native/syphon_addon.mm the native addon
binding.gyp          build config
frameworks/Syphon.framework
```

and in `package.json`:

```json
"dependencies": { "bindings": "^1.5.0", "node-addon-api": "^3.0.0" },
"devDependencies": { "node-gyp": "^9.0.0" },
"scripts": { "install": "node-gyp rebuild" }
```

The addon uses Node-API (`NAPI_VERSION=8`), so it does not need to be rebuilt per Electron version. It does need to match the CPU architecture.

### Where to load it

| App type | Load the addon in | How frames get there |
| --- | --- | --- |
| `nodeIntegration: true` (like this demo) | The renderer | Call `publishFrame` directly |
| `contextIsolation: true` (recommended) | The **main process** | Renderer sends pixels over IPC, or main captures them itself |

For isolated renderers, load the addon in `main.js` and expose a narrow channel through a preload script (`ipcRenderer.invoke("syphon:frame", ...)`). Do not turn on `nodeIntegration` just to get Syphon.

IPC copies the frame, so for large frames prefer capturing in the main process (next section).

### Getting pixels out of an app that has no canvas

| Source | How | Notes |
| --- | --- | --- |
| A `<canvas>` | `readPixels` / `getImageData` in the renderer | What this demo does |
| The whole page | `webContents.beginFrameSubscription` or an offscreen window with the `paint` event | Runs in main; works for any web content |
| Just a region | `webContents.capturePage(rect)` | Slow, only for low frame rates |

Offscreen `paint` and `beginFrameSubscription` deliver **BGRA** bitmaps. The addon uploads `GL_RGBA`, so either swap channels in JS or change the addon upload to `GL_BGRA` with `GL_UNSIGNED_INT_8_8_8_8_REV`. Also confirm the row order of the source and set `flipped` accordingly.

Offscreen rendering also solves the "window hidden" problem without relying on throttling flags, because the page renders without being on screen. Newer Electron versions also have experimental shared-texture offscreen output that avoids the CPU copy; check the current Electron docs for your version before relying on it.

### Packaging checklist (the part most likely to bite)

I have **not** verified a packaged build of this project. The `build` config in `package.json` is inherited from the original setup. Check these when you package:

1. **Ship the framework.** Put `Syphon.framework` in the app via `extraResources` / `extraFiles`.
2. **Fix the rpath.** `binding.gyp` uses `@loader_path/../../frameworks` (correct for `build/Release/` in development). In a packaged app the `.node` file and the framework sit in different places, so the rpath must point at wherever you copy the framework to.
3. **Unpack the addon from asar.** Native `.node` files cannot be loaded from inside an asar. Use `asarUnpack: ["**/*.node"]`.
4. **Architecture.** The bundled framework in this repo is arm64 only. For an Intel or universal build you need a universal Syphon.framework and `ARCHS` set accordingly (`binding.gyp` already lists both).
5. **Signing and hardened runtime.** Sign the framework and addon with the same identity. If the framework is signed by a different team, add `com.apple.security.cs.disable-library-validation` to the entitlements. Without it the hardened runtime refuses to load it.
6. **Not sandboxable.** Syphon uses inter-process mechanisms the Mac App Store sandbox blocks, so this approach is for direct distribution only.

### What stays the same in every port

- Creating your own CGL context in the addon. Electron's renderer has no usable GL context to share, so do not call `CGLGetCurrentContext()`.
- Flushing (`glFlush`) before `publishFrameTexture`. Without it, clients see black.
- Building the addon with `node-gyp`, with `ELECTRON_RUN_AS_NODE` unset when running from VS Code.

### If you outgrow the OpenGL path

`SyphonOpenGLServer` uses OpenGL, which Apple has deprecated, though it still works. The Syphon framework in this repo also ships `SyphonMetalServer`. A Metal version of the addon would upload the frame into an `MTLTexture` and publish that instead. It is a rewrite of `syphon_addon.mm` only; the JavaScript side does not change.
