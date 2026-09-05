// Phase 3 (push side — BUILD.md §15): reads everything locally-dirty for
// one gym and lets the renderer's push orchestration (src/data/local/
// sync.js — Firestore access only exists there, same constraint
// bootstrap.js already worked around) mark it synced once Firestore
// confirms it landed. This file never talks to Firestore itself — it only
// reads/writes local SQLite, same seam discipline as every other file
// under electron/local-db/.
//
// Deliberately reuses each table's EXISTING row-mapper (rowToPayment,
// rowToPlan, etc.) rather than re-implementing field shaping here — the
// shape returned to the renderer is exactly what listPaymentsByGym/
// listPlans/etc. already return (ISO-string dates, real booleans, parsed
// JSON), so the renderer's push logic only has to add the Timestamp
// conversion (§ src/data/local/sync.js), not re-derive field names.

const { rowToPayment } = require("./payments.cjs");
const { rowToAttendance } = require("./attendance.cjs");
const { rowToMembershipRecord } = require("./membershipRecords.cjs");
const { rowToEquipmentRecord } = require("./equipmentRecords.cjs");
const { rowToActivity } = require("./activityLog.cjs");
const { rowToPlan } = require("./plans.cjs");
const { rowToCustomField } = require("./customFields.cjs");
const { rowToUser } = require("./users.cjs");
const { rowToMember } = require("./members.cjs");

// Table -> mapper, for both the pending-rows queries and markSynced's
// allowlist (collectionName arrives over IPC from the renderer, and
// table/column names can never be parameterized with `?` — same
// allowlist-before-string-concatenation discipline ledger.cjs's
// FACT_TABLES map already established).
const FACT_TABLES = {
  payments: rowToPayment,
  attendance: rowToAttendance,
  membership_records: rowToMembershipRecord,
  equipment_records: rowToEquipmentRecord,
  activity_log: rowToActivity,
};
const ENTITY_TABLES = {
  plans: rowToPlan,
  custom_fields: rowToCustomField,
  users: rowToUser,
  members: rowToMember,
};
const ALL_TABLES = { ...FACT_TABLES, ...ENTITY_TABLES };

function pendingRows(db, table, mapper, gymId) {
  return db.prepare(`SELECT * FROM ${table} WHERE gym_id = ? AND sync_status = 'pending'`).all(gymId).map(mapper);
}

function getPendingFactRows(db, { gymId }) {
  const result = {};
  for (const [table, mapper] of Object.entries(FACT_TABLES)) result[table] = pendingRows(db, table, mapper, gymId);
  return result;
}

function getPendingEntityRows(db, { gymId }) {
  const result = {};
  for (const [table, mapper] of Object.entries(ENTITY_TABLES)) result[table] = pendingRows(db, table, mapper, gymId);
  return result;
}

// Aliased to `table` (the schema column is table_name, avoiding the SQL
// keyword) — matches what pushDeletes (src/data/local/sync.js) and
// clearPendingDeletes below both already expect on the returned objects.
// "table" is itself a reserved SQL keyword, so the alias needs quoting —
// same reason the schema column isn't just called `table` to begin with.
function getPendingDeletes(db, { gymId }) {
  return db.prepare('SELECT table_name AS "table", id FROM pending_deletes WHERE gym_id = ?').all(gymId);
}

/** `ids` — up to a few hundred per call (one push batch's worth); SQLite's
 *  own bound-parameter limit (999 by default) is far above anything a
 *  single sync cycle would ever hit at this app's scale. */
function markSynced(db, { table, ids }) {
  if (!ALL_TABLES[table]) throw new Error(`markSynced: "${table}" is not a syncable table.`);
  if (!ids || ids.length === 0) return;
  // Reaching Firestore is exactly what remote_created records, so a
  // confirmed member push sets it here too — otherwise an edit pushed
  // before any pull would still look local-only on the next cycle.
  if (table === "members") {
    const q = ids.map(() => "?").join(", ");
    db.prepare(`UPDATE members SET remote_created = 1 WHERE id IN (${q})`).run(...ids);
  }
  const placeholders = ids.map(() => "?").join(", ");
  db.prepare(`UPDATE ${table} SET sync_status = 'synced' WHERE id IN (${placeholders})`).run(...ids);
}

function clearPendingDeletes(db, { items }) {
  const stmt = db.prepare("DELETE FROM pending_deletes WHERE table_name = ? AND id = ?");
  for (const { table, id } of items || []) stmt.run(table, id);
}

/** Total locally-pending count for a gym (Milestone 3's "Sync now" button
 *  badge, BUILD.md §15) — sums what's already computed above rather than
 *  a fourth copy of the table lists as raw SQL. */
function getPendingCount(db, { gymId }) {
  const fact = getPendingFactRows(db, { gymId });
  const entity = getPendingEntityRows(db, { gymId });
  const deletes = getPendingDeletes(db, { gymId });
  let total = deletes.length;
  for (const rows of Object.values(fact)) total += rows.length;
  for (const rows of Object.values(entity)) total += rows.length;
  return total;
}

/** Corrects a local member_no after push's existence-check (src/data/
 *  local/sync.js) finds the member already exists in Firestore under a
 *  different number than local computed — defensive resync, not the
 *  common case (see that file's own comment on why this can happen). */
function applyMemberRenumber(db, { memberId, memberNo }) {
  db.prepare("UPDATE members SET member_no = ?, remote_created = 1, sync_status = 'synced' WHERE id = ?").run(memberNo, memberId);
}

module.exports = {
  getPendingFactRows,
  getPendingEntityRows,
  getPendingDeletes,
  getPendingCount,
  markSynced,
  clearPendingDeletes,
  applyMemberRenumber,
};
