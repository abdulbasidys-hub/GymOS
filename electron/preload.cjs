// Runs in a privileged context before the renderer's own JS, with access to
// both Node and (via contextBridge) the page — the only sanctioned bridge
// between them, since main.cjs turns off nodeIntegration in the renderer
// itself. window.gymOS.isElectron is what src/data/ branches every
// function on. window.gymOS.db is Phase 2's local-SQLite surface
// (BUILD.md §15) — one generic invoke(operation, args) rather than one
// bridge method per operation (registering a new operation is one entry in
// electron/local-db/index.cjs's dispatch map, not a matching pair of new
// preload/main wiring; this project has no TypeScript anywhere, so narrow
// per-operation methods wouldn't buy real compile-time safety either way),
// plus two subscribe methods for the live listeners src/auth.jsx depends
// on (watchUserRecord/watchGym).

const { contextBridge, ipcRenderer } = require("electron");

/** Shared by onUserRecordChange/onGymChange — same shape onSnapshot gives
 *  callers: subscribe now, get a matching unsubscribe function back. */
function subscribe(topic, id, callback) {
  const channel = `local-db:changed:${topic}:${id}`;
  const listener = (_event, record) => callback(record);
  ipcRenderer.on(channel, listener);
  ipcRenderer.invoke(`local-db:watch-${topic}`, id).catch(() => {});
  return () => {
    ipcRenderer.removeListener(channel, listener);
    ipcRenderer.invoke(`local-db:unwatch-${topic}`, id).catch(() => {});
  };
}

/** local_session (BUILD.md §15's offline-auth pass) holds at most one
 *  row — no id to key on, unlike subscribe() above, so its own small
 *  variant rather than passing subscribe() an empty id. */
function subscribeSession(callback) {
  const channel = "local-db:changed:session";
  const listener = (_event, record) => callback(record);
  ipcRenderer.on(channel, listener);
  ipcRenderer.invoke("local-db:watch-session").catch(() => {});
  return () => {
    ipcRenderer.removeListener(channel, listener);
    ipcRenderer.invoke("local-db:unwatch-session").catch(() => {});
  };
}

contextBridge.exposeInMainWorld("gymOS", {
  isElectron: true,
  db: {
    invoke: (operation, args) => ipcRenderer.invoke("local-db:invoke", operation, args),
    onUserRecordChange: (uid, callback) => subscribe("user", uid, callback),
    onGymChange: (gymId, callback) => subscribe("gym", gymId, callback),
    onLocalSessionChange: (callback) => subscribeSession(callback),
  },
  // CloseButton.jsx's only control — the frameless window (electron/
  // main.cjs) has no native close button to fall back on, and opens
  // maximized by default with no minimize/maximize surfaced at all
  // (BUILD.md §15 — explicit follow-up request superseded the earlier
  // fuller title bar).
  windowControls: {
    close: () => ipcRenderer.invoke("window:close"),
  },
});
