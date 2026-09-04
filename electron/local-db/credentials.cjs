// Offline authentication (BUILD.md §15) — lets a staff member sign in on
// THIS device without network, once they've personally signed in online
// here at least once. Firebase never exposes password hashes to any
// client, so there is no way to pre-authorize a gym's whole staff from
// just one person's login — each person's OWN offline sign-in only
// activates the moment THEY personally complete a real online sign-in on
// this device (the one and only moment a plaintext password is ever seen
// here — captured, hashed with crypto.scrypt (salted, memory-hard),
// discarded; never written or logged in plaintext).
//
// Deliberately a table separate from `users` (which mirrors Firestore and
// flows through the generic sync/push machinery — ALL_TABLES in
// sync.cjs, etc.): keeping password material in a table those lists never
// mention makes "a hash accidentally reaches Firestore" structurally
// impossible, not just unlikely.
//
// The 14-day offline-credential freshness check reuses the SAME
// forward-only clock already built for Phase 4 license enforcement
// (syncMeta.cjs's advanceForwardClock) rather than a second clock-trust
// mechanism — a rolled-back system clock can't extend offline access past
// 14 days for the same reason it can't dodge a subscription lockout.

const crypto = require("crypto");
const { advanceForwardClock } = require("./syncMeta.cjs");

// Two weeks. One online sign-in buys 14 days of offline sign-ins; after
// that the desk must reach Firebase again so the account can be
// re-validated (still employed, password unchanged, gym not suspended).
// Was 30 days until 2026-09-04 — tightened on request, and it is a
// TIGHTENING: a device that has been offline between 14 and 30 days and
// used to sign in will now be refused with reason "expired".
const OFFLINE_CREDENTIAL_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

function normalizeUsername(username) {
  return String(username).trim().toLowerCase();
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return { hash: hash.toString("hex"), salt: salt.toString("hex") };
}

function passwordMatches(password, storedHashHex, storedSaltHex) {
  const salt = Buffer.from(storedSaltHex, "hex");
  const candidate = crypto.scryptSync(password, salt, 64);
  const stored = Buffer.from(storedHashHex, "hex");
  return candidate.length === stored.length && crypto.timingSafeEqual(candidate, stored);
}

/** Called right after a successful ONLINE Firebase sign-in — captures or
 *  refreshes this user's offline-login credential (also picks up a
 *  password change automatically, next time they sign in online). */
function captureCredential(db, { uid, username, gymId, password }) {
  const { hash, salt } = hashPassword(password);
  db.prepare(
    `INSERT INTO local_credentials (uid, username, gym_id, password_hash, password_salt, last_online_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(uid) DO UPDATE SET
       username = excluded.username, gym_id = excluded.gym_id,
       password_hash = excluded.password_hash, password_salt = excluded.password_salt,
       last_online_at = excluded.last_online_at`
  ).run(uid, normalizeUsername(username), gymId ?? null, hash, salt, new Date().toISOString());
}

/** Attempted only after a real online sign-in has already failed due to a
 *  network error. Returns `{ ok: true, uid, username, gymId }` on a
 *  valid, still-fresh match; otherwise `{ ok: false, reason: "not_found" |
 *  "invalid" | "expired" }` — the renderer surfaces a distinct message
 *  per reason rather than one generic "sign-in failed". */
function verifyCredential(db, { username, password }) {
  const row = db.prepare("SELECT * FROM local_credentials WHERE username = ?").get(normalizeUsername(username));
  if (!row) return { ok: false, reason: "not_found" };
  if (!passwordMatches(password, row.password_hash, row.password_salt)) {
    return { ok: false, reason: "invalid" };
  }

  // gym_id should always be set in practice (captured right after a real
  // online sign-in, which always knows the signed-in user's gym) — this
  // guard only matters for a role this whole feature was never meant for
  // (superadmin/affiliate have no gym_id), so it degrades to "never
  // expires" for them rather than throwing on sync_meta's NOT NULL gym_id.
  if (row.gym_id) {
    const { now } = advanceForwardClock(db, { gymId: row.gym_id, now: new Date().toISOString() });
    const ageMs = new Date(now).getTime() - new Date(row.last_online_at).getTime();
    if (ageMs > OFFLINE_CREDENTIAL_MAX_AGE_MS) return { ok: false, reason: "expired" };
  }

  return { ok: true, uid: row.uid, username: row.username, gymId: row.gym_id };
}

module.exports = { captureCredential, verifyCredential };
