// Electron Phase 1 wraps the web app unchanged (still true for Admin/
// Affiliate — they stay Firestore-only, permanently). Phase 2 (BUILD.md
// §15) adds local SQLite for Desk/Owner: this file now also opens the
// encrypted local database and registers the IPC surface
// electron/preload.cjs's contextBridge exposes as window.gymOS.db.
//
// .cjs, not .js — package.json has "type": "module" for the Vite/React
// side (the renderer), but Electron's main process is simplest as plain
// CommonJS. The .cjs extension forces that regardless of the package.json
// "type" field, so this file can use require()/__dirname normally.

const { app, BrowserWindow, ipcMain, safeStorage, Menu } = require("electron");
const path = require("node:path");
const { getConnection } = require("./local-db/connection.cjs");
const { buildOperations } = require("./local-db/index.cjs");
const { watchUser, watchGymRecord, watchLocalSession } = require("./local-db/watchers.cjs");
const { clearLocalSession } = require("./local-db/session.cjs");

// Set by registerLocalDb() once the encrypted connection is open — kept at
// module scope (not local to that function) specifically so the
// before-quit handler below can reuse the SAME connection rather than
// opening a second one to the same SQLCipher file.
let dbConnection = null;

// Sets by `npm run electron:dev` (see package.json) — true while the Vite
// dev server is running, false for the packaged/production build, which
// loads the built dist/index.html straight off disk instead.
const isDev = process.env.ELECTRON_DEV === "true";

// Per-webContents live-listener cleanup (BUILD.md §15's watchers.cjs note:
// without this, electron:dev's Vite HMR reloads would accumulate stale
// EventEmitter listeners forever, since each reload asks to (re)subscribe
// without ever explicitly unsubscribing the previous page's listeners).
// Map<webContents.id, Map<"user:<uid>" | "gym:<id>", unsubscribeFn>>
const activeWatches = new Map();

function registerLocalDb() {
  const db = getConnection(app.getPath("userData"), safeStorage);
  dbConnection = db;
  const operations = buildOperations(db);

  ipcMain.handle("local-db:invoke", (event, operation, args) => {
    const fn = operations[operation];
    if (!fn) throw new Error(`Unknown local-db operation: "${operation}"`);
    return fn(args);
  });

  ipcMain.handle("local-db:watch-user", (event, uid) => {
    watchOne(event.sender, `user:${uid}`, (listener) => watchUser(db, uid, listener), "local-db:changed:user:" + uid);
  });
  ipcMain.handle("local-db:unwatch-user", (event, uid) => {
    unwatchOne(event.sender, `user:${uid}`);
  });
  ipcMain.handle("local-db:watch-gym", (event, gymId) => {
    watchOne(event.sender, `gym:${gymId}`, (listener) => watchGymRecord(db, gymId, listener), "local-db:changed:gym:" + gymId);
  });
  ipcMain.handle("local-db:unwatch-gym", (event, gymId) => {
    unwatchOne(event.sender, `gym:${gymId}`);
  });
  // Offline authentication (BUILD.md §15) — Electron's replacement for
  // Firebase's onAuthStateChanged. No id in the key/channel (unlike
  // user/gym above) — local_session holds at most one row, there's only
  // ever one session per device to watch.
  ipcMain.handle("local-db:watch-session", (event) => {
    watchOne(event.sender, "session", (listener) => watchLocalSession(db, listener), "local-db:changed:session");
  });
  ipcMain.handle("local-db:unwatch-session", (event) => {
    unwatchOne(event.sender, "session");
  });
}

/** Starts (or restarts, idempotently) a watch for one webContents/key pair, pushing changes down `channel`. */
function watchOne(sender, key, subscribe, channel) {
  let forSender = activeWatches.get(sender.id);
  if (!forSender) {
    forSender = new Map();
    activeWatches.set(sender.id, forSender);
    sender.once("destroyed", () => cleanupSender(sender.id));
  }
  forSender.get(key)?.(); // unsubscribe any existing watch for this exact key first — avoids leaking duplicates
  const unsubscribe = subscribe((record) => {
    if (!sender.isDestroyed()) sender.send(channel, record);
  });
  forSender.set(key, unsubscribe);
}

function unwatchOne(sender, key) {
  activeWatches.get(sender.id)?.get(key)?.();
  activeWatches.get(sender.id)?.delete(key);
}

function cleanupSender(senderId) {
  activeWatches.get(senderId)?.forEach((unsubscribe) => unsubscribe());
  activeWatches.delete(senderId);
}

// No title bar at all (BUILD.md §15 — superseded the earlier full custom
// title bar with minimize/maximize/close: explicit follow-up request was
// to drop the bar entirely, open full screen by default, and surface
// only a close control, placed in the page itself rather than a
// dedicated top strip — CloseButton.jsx). `close` is the only window
// control left; `BrowserWindow.fromWebContents(event.sender)`, not a
// captured `win` reference, so this still targets the right window even
// if more than one ever exists.
function registerWindowControls() {
  ipcMain.handle("window:close", (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close();
  });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    show: false,
    // electron-builder already bakes build/icon.ico into the packaged
    // .exe (taskbar/shortcut icon) via package.json's build.win.icon —
    // this is what makes an UNPACKAGED `npm run electron:dev` window show
    // the real logo too, instead of Electron's default icon.
    icon: path.join(__dirname, "..", "build", "icon.ico"),
    // Frameless — no OS title bar, no app menu, and (per the explicit
    // follow-up request this superseded a fuller custom title bar with)
    // no in-app title bar either; CloseButton.jsx is the only window
    // chrome left, floated over the page itself. Still resizable via the
    // window edges by default.
    frame: false,
    webPreferences: {
      // Standard modern-Electron security posture: the renderer (the React
      // app) never gets direct Node/filesystem access. Later phases that
      // need it (local SQLite, license verification) expose a narrow API
      // through preload.cjs's contextBridge instead of loosening this.
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.cjs"),
    },
  });

  // "The natural view should be full screen" — opens maximized rather
  // than at the fixed 1280×800 size above (which now only matters as the
  // size Windows restores to if someone un-maximizes it). Only shown
  // once the page has actually painted, so there's no flash of a blank
  // white/black window while it loads.
  win.once("ready-to-show", () => {
    win.maximize();
    win.show();
  });

  if (isDev) {
    win.loadURL(process.env.ELECTRON_DEV_SERVER_URL || "http://localhost:5173");
    win.webContents.openDevTools({ mode: "detach" });
  } else {
    win.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }
}

app.whenReady().then(() => {
  // The default File/Edit/View/Window menu is unused boilerplate this app
  // never needed — gone along with the native title bar it used to hang
  // off of.
  Menu.setApplicationMenu(null);
  // Before createWindow() — the renderer's very first script can call
  // window.gymOS.db.invoke("ping") immediately on load, so the handlers
  // need to already be registered by the time any page starts running.
  registerLocalDb();
  registerWindowControls();
  createWindow();

  // macOS convention: clicking the dock icon with no windows open should
  // reopen one rather than requiring a relaunch. No-op on Windows/Linux.
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Windows/Linux convention: closing the last window quits the app.
// macOS convention: the app stays running (in the dock) until Cmd+Q.
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// Explicit request: closing the app signs out, full stop — reopening
// must always land on the login screen, never silently resume as
// whoever last signed in (a desk device is commonly shared across
// receptionists/shifts; auto-resuming the previous person's session on
// relaunch is exactly the "someone sees the account still open" risk the
// idle-timeout above already exists to guard against, just triggered by
// closing the app instead of by 30 minutes of inactivity). `before-quit`
// fires once, reliably, on every real quit path (window close → app
// quit, OS shutdown/logoff) — unlike a renderer-side "beforeunload",
// this runs main-process-side with direct DB access, no IPC round trip
// needed, and can't be skipped by the window already having torn down.
// Minimizing the window does NOT fire this — only an actual close/quit
// does, matching "whenever the app is CLOSED" specifically.
app.on("before-quit", () => {
  if (!dbConnection) return;
  try {
    clearLocalSession(dbConnection);
  } catch (err) {
    console.error("Failed to clear local session on quit:", err);
  }
});
