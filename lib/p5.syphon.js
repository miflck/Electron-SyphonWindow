/*
 * p5.syphon: publish p5 canvases to Syphon (macOS) from an Electron renderer.
 *
 * Load after p5 and before your sketch (needs nodeIntegration):
 *
 *   <script src="./node_modules/p5/lib/p5.js"></script>
 *   <script src="./lib/p5.syphon.js"></script>
 *   <script src="./sketch.js"></script>
 *
 * Then, at the end of draw():
 *
 *   drawSyphon();                 // main canvas, server "p5"
 *   drawSyphon("My Sketch");      // main canvas, custom server name
 *   drawSyphon(pg, "Layer");      // a createGraphics() buffer (or any canvas)
 *
 * Or without touching draw():
 *
 *   Syphon.auto("My Sketch");     // publishes the main canvas after every frame
 *
 * Works with P2D and WEBGL canvases. Servers are created on first use, one per name.
 */
(function () {
  const path = require("path");
  const { fileURLToPath } = require("url");

  // Folder of this file, so the addon can be found whatever the page's cwd is
  const libDir = document.currentScript
    ? path.dirname(fileURLToPath(document.currentScript.src))
    : __dirname;

  const state = {
    enabled: true,
    defaultName: "p5",
    addonPath: null,
    addon: undefined, // undefined = not tried yet, null = failed
    servers: new Map(), // name -> native server
    buffers: new Map(), // name -> reusable Uint8Array
    listeners: new Set(),
    warned: new Set(),
  };

  function warnOnce(key, ...args) {
    if (state.warned.has(key)) return;
    state.warned.add(key);
    console.warn("[p5.syphon]", ...args);
  }

  function loadAddon() {
    if (state.addon !== undefined) return state.addon;
    const candidates = [
      state.addonPath,
      process.env.SYPHON_ADDON_PATH,
      path.join(libDir, "syphon_addon.node"),
      path.join(libDir, "../build/Release/syphon_addon.node"),
      path.join(process.cwd(), "build/Release/syphon_addon.node"),
    ].filter(Boolean);
    for (const candidate of candidates) {
      try {
        state.addon = require(candidate);
        return state.addon;
      } catch (error) {
        if (error.code !== "MODULE_NOT_FOUND") warnOnce(candidate, `could not load ${candidate}: ${error.message}`);
      }
    }
    warnOnce("addon", "syphon_addon.node not found, tried:\n  " + candidates.join("\n  "));
    state.addon = null;
    return null;
  }

  function emit(error) {
    const info = {
      running: state.servers.size > 0,
      names: [...state.servers.keys()],
      name: state.servers.size ? [...state.servers.keys()][0] : state.defaultName,
      error: error ? String(error.message || error) : null,
    };
    state.listeners.forEach((fn) => fn(info));
  }

  function getServer(name) {
    let server = state.servers.get(name);
    if (server) return server;
    const addon = loadAddon();
    if (!addon) return null;
    try {
      server = new addon.SyphonServerWrapper(name);
    } catch (error) {
      console.error("[p5.syphon] failed to create server", name, error);
      state.enabled = false;
      emit(error);
      return null;
    }
    state.servers.set(name, server);
    emit();
    return server;
  }

  function stopServer(name) {
    const server = state.servers.get(name);
    if (!server) return;
    try {
      server.stop();
    } catch (_) {}
    state.servers.delete(name);
    state.buffers.delete(name);
  }

  // Normalise whatever the caller passed into { canvas, ctx }
  function resolveSource(target, sketch) {
    if (!target) {
      return { canvas: sketch._renderer.canvas, ctx: sketch.drawingContext };
    }
    const canvas = target instanceof HTMLCanvasElement ? target : target.elt || target.canvas;
    let ctx = target.drawingContext;
    if (!ctx && canvas) {
      ctx = canvas.getContext("webgl2") || canvas.getContext("webgl") || canvas.getContext("2d");
    }
    return { canvas, ctx };
  }

  function publish(sketch, target, name) {
    if (typeof target === "string") {
      name = target;
      target = null;
    }
    if (!state.enabled) return false;
    name = name || state.defaultName;

    const { canvas, ctx } = resolveSource(target, sketch);
    if (!canvas || !ctx) {
      warnOnce("nosource", "drawSyphon: no canvas to publish");
      return false;
    }
    const server = getServer(name);
    if (!server) return false;

    // Real pixel size (canvas.width), not p5's width/height, which ignore pixelDensity
    const w = canvas.width;
    const h = canvas.height;
    if (!w || !h) return false;

    try {
      if (typeof ctx.readPixels === "function") {
        // WebGL: rows come back bottom-up, which is what Syphon expects
        let buf = state.buffers.get(name);
        if (!buf || buf.length !== w * h * 4) {
          buf = new Uint8Array(w * h * 4);
          state.buffers.set(name, buf);
        }
        ctx.readPixels(0, 0, w, h, ctx.RGBA, ctx.UNSIGNED_BYTE, buf);
        server.publishFrame(buf, w, h, false);
      } else {
        // 2D: rows are top-down, so tell the addon to flip
        server.publishFrame(ctx.getImageData(0, 0, w, h).data, w, h, true);
      }
    } catch (error) {
      console.error("[p5.syphon] publish failed:", error);
      return false;
    }
    return true;
  }

  const Syphon = {
    /** Publish a frame. Same as drawSyphon(). */
    publish(sketch, target, name) {
      return publish(sketch, target, name);
    },
    /** Publish the main canvas after every frame, no changes to draw() needed. */
    auto(name) {
      if (name) state.defaultName = name;
      if (Syphon._auto) return;
      Syphon._auto = true;
      p5.prototype.registerMethod("post", function () {
        publish(this, null, null);
      });
    },
    /** Name used when drawSyphon() is called without one. */
    setName(name) {
      state.defaultName = name;
    },
    /** Pause or resume publishing. Disabling stops all servers. */
    setEnabled(enabled) {
      state.enabled = !!enabled;
      if (!state.enabled) {
        [...state.servers.keys()].forEach(stopServer);
        emit();
      }
    },
    /** Stop one server, or all of them when called without a name. */
    stop(name) {
      (name ? [name] : [...state.servers.keys()]).forEach(stopServer);
      emit();
    },
    get enabled() {
      return state.enabled;
    },
    get running() {
      return state.servers.size > 0;
    },
    /** Where to find syphon_addon.node if it is not next to / above this file. */
    setAddonPath(p) {
      state.addonPath = p;
      state.addon = undefined;
    },
    /** Subscribe to { running, names, name, error } changes. Returns an unsubscribe function. */
    onChange(fn) {
      state.listeners.add(fn);
      return () => state.listeners.delete(fn);
    },
    /**
     * Optional: let another window (e.g. a control panel) toggle Syphon over
     * Electron IPC. Listens for "set-syphon" and "request-syphon-state" and
     * answers on "syphon-state". Publishing is off until enabled this way.
     */
    useIpc(startEnabled = false) {
      const { ipcRenderer } = require("electron");
      state.enabled = startEnabled;
      ipcRenderer.on("set-syphon", (_e, on) => {
        Syphon.setEnabled(on);
        // Create the server right away so it is visible before the first frame
        if (on) getServer(state.defaultName);
        emit();
      });
      ipcRenderer.on("request-syphon-state", () => emit());
      Syphon.onChange((info) => ipcRenderer.send("syphon-state", info));
    },
  };

  window.Syphon = Syphon;

  // Global in global mode, a method on the instance in instance mode
  p5.prototype.drawSyphon = function (target, name) {
    return publish(this, target, name);
  };
})();
