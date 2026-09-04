// Thin, SQL-free helper each src/data/*.js file's Electron branch calls
// (BUILD.md §15). Never contains SQL or table names itself — that all
// lives in electron/local-db/, main-process-only, since the renderer has
// no filesystem/require() access (contextIsolation: true, nodeIntegration:
// false in electron/main.cjs, on purpose).
export function localInvoke(operation, args) {
  return window.gymOS.db.invoke(operation, args);
}
