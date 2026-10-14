const { app, BrowserWindow, globalShortcut, ipcMain } = require("electron");
const path = require("path");

let controlWindow;
let renderWindow;
let quitting = false;

// Hot reloading
try {
  require("electron-reloader")(module, {
    debug: true,
    watchRenderer: true,
  });
} catch (_) {
  console.log("Error setting up hot reloader");
}

// Keep rendering (and publishing to Syphon) when the render window is in the
// background, hidden or covered by other windows.
app.commandLine.appendSwitch("disable-renderer-backgrounding");
app.commandLine.appendSwitch("disable-backgrounding-occluded-windows");
app.commandLine.appendSwitch("disable-background-timer-throttling");

const webPreferences = {
  nodeIntegration: true,
  contextIsolation: false,
};

function sendToControl(channel, ...args) {
  if (controlWindow && !controlWindow.isDestroyed()) {
    controlWindow.webContents.send(channel, ...args);
  }
}

function createControlWindow() {
  controlWindow = new BrowserWindow({
    width: 280,
    height: 190,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    title: "Syphon Control",
    autoHideMenuBar: true,
    webPreferences,
  });
  controlWindow.loadFile(path.join(__dirname, "ui", "control.html"));
  controlWindow.on("closed", () => {
    controlWindow = null;
    app.quit();
  });
}

function createRenderWindow() {
  renderWindow = new BrowserWindow({
    width: 800,
    height: 600,
    show: false,
    useContentSize: true,
    title: "p5 Sketch",
    autoHideMenuBar: true,
    webPreferences: { ...webPreferences, backgroundThrottling: false },
  });
  renderWindow.loadFile(path.join(__dirname, "ui", "index.html"));

  // Closing the render window only hides it, the control window stays
  renderWindow.on("close", (event) => {
    if (!quitting) {
      event.preventDefault();
      renderWindow.hide();
    }
  });
  renderWindow.on("show", () => sendToControl("window-visible", true));
  renderWindow.on("hide", () => sendToControl("window-visible", false));
}

function toggleRenderWindow() {
  if (!renderWindow) return;
  if (renderWindow.isVisible()) {
    renderWindow.webContents.closeDevTools();
    renderWindow.hide();
  } else {
    renderWindow.show();
  }
}

app.whenReady().then(() => {
  createRenderWindow();
  createControlWindow();

  globalShortcut.register("CommandOrControl+Shift+D", toggleRenderWindow);

  ipcMain.on("toggle-window", toggleRenderWindow);
  ipcMain.on("toggle-devtools", () => {
    if (renderWindow) renderWindow.webContents.toggleDevTools();
  });
  ipcMain.on("set-syphon", (_event, enabled) => {
    if (renderWindow) renderWindow.webContents.send("set-syphon", enabled);
  });
  // The sketch reports its real Syphon state back to the control window
  ipcMain.on("syphon-state", (_event, state) => sendToControl("syphon-state", state));
  // The control window asks for the current state when it loads
  ipcMain.on("control-ready", () => {
    sendToControl("window-visible", !!renderWindow && renderWindow.isVisible());
    if (renderWindow) renderWindow.webContents.send("request-syphon-state");
  });
});

app.on("window-all-closed", () => app.quit());

app.on("before-quit", () => {
  quitting = true;
});

app.on("will-quit", () => globalShortcut.unregisterAll());
