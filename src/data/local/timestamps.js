// Shared Timestamp <-> ISO-string field knowledge for both directions
// that cross the Electron IPC boundary (BUILD.md §15): push converts
// local ISO strings TO Firestore Timestamps before writing up (sync.js);
// bootstrap/pull convert live Firestore Timestamps TO ISO strings before
// the record ever reaches an IPC call (bootstrap.js, pull.js).
//
// That second direction MUST happen in the renderer, before the IPC
// call — Electron's structured-clone strips a class instance's prototype
// methods, including Timestamp.prototype.toDate, so main-process code can
// never recover a Timestamp from what IPC hands it. Getting this backwards
// (converting defensively main-process-side, after the fact) was Phase
// 3's Finding D, a real bug that silently no-op'd bootstrap for every
// real gym — caught by tracing the code, not by the standalone-Node-script
// verification, since that never exercises a real IPC round-trip.
//
// One shared source for which fields are timestamp-shaped on which table,
// so push/bootstrap/pull can't silently drift out of sync about it the
// way they briefly did here: sync.js's own local copy of this map didn't
// include `members` even though pushMembers calls prepareEntityDoc(
// "members", ...) — a real bug (iterating `undefined` throws), fixed by
// centralizing this instead of maintaining three copies.

import { Timestamp } from "firebase/firestore";

export const FACT_TIMESTAMP_FIELDS = {
  payments: ["created_at", "paid_at"],
  attendance: ["created_at", "recorded_at"],
  membership_records: ["created_at", "start_date", "expiry_date"],
  equipment_records: ["created_at", "start_date", "expiry_date"],
  activity_log: ["created_at", "at"],
};

export const ENTITY_TIMESTAMP_FIELDS = {
  plans: ["created_at"],
  custom_fields: ["created_at"],
  users: ["created_at"],
  // updated_at is stamped on every member edit (bio-data changes and photo
  // uploads) and drives the pull's second, edit-catching cursor — it has to
  // be converted like the others so the cursor it stores is an ISO string,
  // not a raw Firestore Timestamp. Absent on members never edited since
  // registration, and toIsoValue passes nullish straight through.
  members: ["created_at", "date_joined", "updated_at"],
};

/** Firestore Timestamp | JS Date | already-a-string | nullish -> ISO
 *  string | null. Idempotent (safe to call on an already-converted
 *  value) — checked in this order specifically so a plain string short-
 *  circuits before the `.toDate` duck-type check. */
export function toIsoValue(value) {
  if (value == null) return null;
  if (typeof value === "string") return value;
  if (typeof value.toDate === "function") return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  return value;
}

/** ISO string | JS Date | nullish -> Firestore Timestamp | null. */
export function toTimestampValue(value) {
  if (value == null) return null;
  return Timestamp.fromDate(value instanceof Date ? value : new Date(value));
}

function convertFields(row, fields, converter) {
  const out = { ...row };
  for (const field of fields || []) {
    if (out[field] != null) out[field] = converter(out[field]);
  }
  return out;
}

/** Firestore-shaped row -> local-SQLite-shaped row (Timestamps -> ISO). */
export function rowToIso(table, row, fieldMap) {
  return convertFields(row, fieldMap[table], toIsoValue);
}

/** Local-SQLite-shaped row -> Firestore-shaped row (ISO -> Timestamps). */
export function rowToTimestamps(table, row, fieldMap) {
  return convertFields(row, fieldMap[table], toTimestampValue);
}

/** gyms' subscription fields are nested, not flat — handled separately
 *  from the per-table field maps above (used by bootstrap/pull only;
 *  push never writes to gyms locally-writable-wise beyond updateGymName,
 *  which has no Timestamp fields of its own). */
export function gymToIso(gym) {
  if (!gym) return gym;
  const out = { ...gym, created_at: toIsoValue(gym.created_at) };
  if (gym.subscription) {
    out.subscription = {
      ...gym.subscription,
      activated_at: toIsoValue(gym.subscription.activated_at),
      expiry_date: toIsoValue(gym.subscription.expiry_date),
      last_verified_at: toIsoValue(gym.subscription.last_verified_at),
    };
  }
  return out;
}
