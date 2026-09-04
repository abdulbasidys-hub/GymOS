// local_session (schema v3, BUILD.md §15) — Electron's own source of
// truth for "who is signed in right now," replacing dependence on
// Firebase Auth's own persistence for that question (see src/auth.jsx,
// src/data/accounts.js). One row in practice — a desk device has exactly
// one active session at a time, not a history table.

function getLocalSession(db) {
  return db.prepare("SELECT * FROM local_session LIMIT 1").get() ?? null;
}

function setLocalSession(db, { uid, username, gymId }) {
  const now = new Date().toISOString();
  db.exec("DELETE FROM local_session"); // enforce "at most one session" without a fixed-id hack
  db.prepare(
    "INSERT INTO local_session (uid, username, gym_id, signed_in_at, last_activity_at) VALUES (?, ?, ?, ?, ?)"
  ).run(uid, username ?? null, gymId ?? null, now, now);
}

function clearLocalSession(db) {
  db.exec("DELETE FROM local_session");
}

/** Called on real user activity (renderer-debounced) and re-checked on
 *  window focus/visibility regain — see useIdleTimeout.js's own comment
 *  on why a plain in-memory timer alone can't catch a laptop that slept
 *  through the 30-minute window. */
function touchLocalSessionActivity(db, { at } = {}) {
  db.prepare("UPDATE local_session SET last_activity_at = ?").run(at ?? new Date().toISOString());
}

module.exports = { getLocalSession, setLocalSession, clearLocalSession, touchLocalSessionActivity };
