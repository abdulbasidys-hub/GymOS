// Local push mechanism for the two Firestore onSnapshot listeners
// src/auth.jsx depends on (watchUserRecord, watchGym) — SQLite itself has
// no native change-notification, so this is a plain EventEmitter pair,
// keyed by uid/gymId. Every local write that touches a watched row
// (setUserActive/setUserPhone/setUserEmail for users; updateGymName for
// gyms — the only Desk/Owner-writable fields on those two tables) re-reads
// that row and emits it here.
//
// Named limitation (see BUILD.md §15): this only ever fires on LOCAL
// writes on THIS device. It can't reflect a remote-only change (an owner
// editing from the web, a super-admin suspending the gym) until Phase 3's
// pull-sync exists — same Phase 2/3 boundary as everywhere else in this
// design, not a new gap.

const { EventEmitter } = require("node:events");
const { getUserRecord } = require("./users.cjs");
const { getGym } = require("./gyms.cjs");
const { getLocalSession } = require("./session.cjs");

const userEvents = new EventEmitter();
const gymEvents = new EventEmitter();
// One fixed key ("session") rather than per-uid, matching local_session's
// own "at most one row" shape — there's only ever one session to watch.
const sessionEvents = new EventEmitter();
const SESSION_KEY = "session";

// EventEmitter warns past 10 listeners by default — not a real leak at
// this app's scale (one desk, a handful of windows at most), but raising
// it avoids a spurious console warning during normal use/dev reloads.
userEvents.setMaxListeners(50);
gymEvents.setMaxListeners(50);
sessionEvents.setMaxListeners(50);

function emitUserChanged(db, uid) {
  userEvents.emit(uid, getUserRecord(db, { uid }));
}

function emitGymChanged(db, gymId) {
  gymEvents.emit(gymId, getGym(db, { gymId }));
}

function emitLocalSessionChanged(db) {
  sessionEvents.emit(SESSION_KEY, getLocalSession(db));
}

/** Returns an unsubscribe function, mirroring onSnapshot's own shape. */
function watchUser(db, uid, listener) {
  userEvents.on(uid, listener);
  listener(getUserRecord(db, { uid })); // fire immediately with current state, like onSnapshot does
  return () => userEvents.off(uid, listener);
}

function watchGymRecord(db, gymId, listener) {
  gymEvents.on(gymId, listener);
  listener(getGym(db, { gymId }));
  return () => gymEvents.off(gymId, listener);
}

/** Electron's replacement for Firebase's onAuthStateChanged (BUILD.md
 *  §15's offline-auth pass) — fires immediately with whatever
 *  local_session currently holds (null if nobody's signed in), then again
 *  on every sign-in/sign-out/session-refresh. */
function watchLocalSession(db, listener) {
  sessionEvents.on(SESSION_KEY, listener);
  listener(getLocalSession(db));
  return () => sessionEvents.off(SESSION_KEY, listener);
}

module.exports = {
  emitUserChanged,
  emitGymChanged,
  emitLocalSessionChanged,
  watchUser,
  watchGymRecord,
  watchLocalSession,
};
