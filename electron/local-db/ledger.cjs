// The local mirror of src/data/ledger.js's appendRecord/appendAdjustment —
// the ONE shared write path for the 5 Desk/Owner-relevant FACT collections
// (activity_log, attendance, equipment_records, membership_records,
// payments). Getting this right covers createPayment/recordAttendance/
// createMembershipRecord/createEquipmentRecord/logActivity with zero
// further changes to those five src/data/*.js files' create functions —
// see BUILD.md §15.
//
// `collectionName` arrives over IPC from the renderer. Table/column names
// can never be parameterized with `?` (only values can), so this checks
// collectionName against a hardcoded allowlist BEFORE it ever reaches a
// string-concatenated SQL statement — closes the injection-shaped gap even
// though today's only caller is trusted app code, not external input.
//
// better-sqlite3 throws on an `undefined` bind parameter (unlike
// Firestore, which just silently drops undefined keys via stripUndefined)
// — every column here gets an explicit `?? null` rather than relying on
// stripUndefined's "remove the key" behavior, which doesn't help once the
// column already exists in the table regardless.

const { newId, nowIso } = require("./helpers.cjs");

// One entry per FACT table: its domain-specific columns (universal
// id/created_at/actor_uid/sync_status/adjusts_id/is_adjustment are added
// automatically) and any JS-key -> SQL-column renames (only "for" ->
// "for_type" today, since "for" is a reserved SQLite keyword).
const FACT_TABLES = {
  activity_log: { columns: ["gym_id", "action", "target", "at"] },
  attendance: { columns: ["gym_id", "member_id", "receptionist_uid", "recorded_at"] },
  equipment_records: {
    columns: ["gym_id", "member_id", "plan_id", "plan_name", "start_date", "expiry_date", "payment_id"],
  },
  membership_records: {
    columns: ["gym_id", "member_id", "plan_id", "plan_name", "start_date", "expiry_date", "payment_id"],
  },
  payments: {
    columns: [
      "gym_id", "member_id", "receptionist_uid", "plan_id", "plan_name", "plan_type",
      "amount", "for_type", "duration_count", "duration_unit", "paid_at",
    ],
    rename: { for: "for_type" },
  },
};

/** JS Date -> ISO string for storage; passes through anything else as-is (already a string, or null/undefined). */
function toIso(value) {
  if (value === undefined || value === null) return null;
  return value instanceof Date ? value.toISOString() : value;
}

function appendRecord(db, { collectionName, data, actorUid }) {
  const table = FACT_TABLES[collectionName];
  if (!table) throw new Error(`appendRecord: "${collectionName}" is not a local FACT table.`);

  const rename = table.rename || {};
  const id = newId();
  const created_at = nowIso();

  const values = table.columns.map((col) => {
    const jsKey = Object.keys(rename).find((k) => rename[k] === col) || col;
    return toIso(data[jsKey] ?? null);
  });

  const allColumns = [...table.columns, "id", "created_at", "actor_uid", "sync_status", "adjusts_id", "is_adjustment"];
  const allValues = [
    ...values,
    id,
    created_at,
    actorUid ?? null,
    "pending", // web phase writes "synced" immediately; local writes start "pending" until Phase 3 syncs them up
    data.adjusts_id ?? null,
    data.is_adjustment ? 1 : 0,
  ];

  const placeholders = allColumns.map(() => "?").join(", ");
  db.prepare(`INSERT INTO ${collectionName} (${allColumns.join(", ")}) VALUES (${placeholders})`).run(...allValues);

  // Return the same shape appendRecord returns on the web (the stored record).
  const record = { id, actor_uid: actorUid ?? null, created_at, sync_status: "pending" };
  table.columns.forEach((col) => {
    const jsKey = Object.keys(rename).find((k) => rename[k] === col) || col;
    record[jsKey] = data[jsKey];
  });
  if (data.adjusts_id !== undefined) record.adjusts_id = data.adjusts_id;
  if (data.is_adjustment !== undefined) record.is_adjustment = data.is_adjustment;
  return record;
}

function appendAdjustment(db, { collectionName, originalId, data, actorUid }) {
  return appendRecord(db, {
    collectionName,
    data: { ...data, adjusts_id: originalId, is_adjustment: true },
    actorUid,
  });
}

module.exports = { appendRecord, appendAdjustment, FACT_TABLES };
