// Local mirror of src/data/customFields.js. A mutable entity — doesn't
// route through ledger.cjs — with the one genuine hard-delete in this
// schema (deleteCustomField).

const { newId, nowIso } = require("./helpers.cjs");

// Every UPDATE below now also sets sync_status='pending' (BUILD.md §15,
// Phase 3) — without this, push's getPendingEntityRows query would never
// find a locally-edited field, since bootstrap-imported rows start out
// 'synced' and nothing was flipping them back.

function rowToCustomField(row) {
  if (!row) return null;
  return { ...row, required: !!row.required, active: !!row.active };
}

function createCustomField(db, { gymId, label, type, required, actorUid }) {
  const id = newId();
  const created_at = nowIso();
  db.prepare(
    `INSERT INTO custom_fields (id, gym_id, label, type, required, active, created_at, actor_uid, sync_status)
     VALUES (?, ?, ?, ?, ?, 1, ?, ?, 'pending')`
  ).run(id, gymId, String(label).trim(), type, required ? 1 : 0, created_at, actorUid ?? null);
  return rowToCustomField(db.prepare("SELECT * FROM custom_fields WHERE id = ?").get(id));
}

function listCustomFields(db, { gymId }) {
  // created_at is stored as an ISO string, so a plain lexicographic sort
  // matches chronological order — same "oldest first" ordering
  // listCustomFields produces on the web via toDate(...).getTime().
  return db
    .prepare("SELECT * FROM custom_fields WHERE gym_id = ? ORDER BY created_at ASC")
    .all(gymId)
    .map(rowToCustomField);
}

function updateCustomField(db, { fieldId, label, type, required }) {
  const current = db.prepare("SELECT * FROM custom_fields WHERE id = ?").get(fieldId);
  if (!current) throw new Error("Custom field not found");
  db.prepare("UPDATE custom_fields SET label = ?, type = ?, required = ?, sync_status = 'pending' WHERE id = ?").run(
    label !== undefined ? String(label).trim() : current.label,
    type !== undefined ? type : current.type,
    required !== undefined ? (required ? 1 : 0) : current.required,
    fieldId
  );
}

function retireCustomField(db, { fieldId }) {
  db.prepare("UPDATE custom_fields SET active = 0, sync_status = 'pending' WHERE id = ?").run(fieldId);
}

function reactivateCustomField(db, { fieldId }) {
  db.prepare("UPDATE custom_fields SET active = 1, sync_status = 'pending' WHERE id = ?").run(fieldId);
}

// A hard local DELETE leaves nothing behind to flag 'pending' — the
// tombstone in pending_deletes is what push (sync.cjs) reads instead, so
// the matching Firestore doc gets deleteDoc'd too. Same transaction as
// the DELETE itself so the two can't drift apart (a crash between them
// would either lose the delete locally-fine-but-never-pushed, or leave an
// orphan tombstone for a row that was never actually deleted — this makes
// both impossible).
function deleteCustomField(db, { fieldId }) {
  const tx = db.transaction(() => {
    const current = db.prepare("SELECT gym_id FROM custom_fields WHERE id = ?").get(fieldId);
    db.prepare("DELETE FROM custom_fields WHERE id = ?").run(fieldId);
    db.prepare(
      "INSERT OR REPLACE INTO pending_deletes (table_name, id, gym_id, deleted_at) VALUES ('custom_fields', ?, ?, ?)"
    ).run(fieldId, current?.gym_id ?? null, nowIso());
  });
  tx();
}

module.exports = {
  createCustomField,
  listCustomFields,
  updateCustomField,
  retireCustomField,
  reactivateCustomField,
  deleteCustomField,
  rowToCustomField,
};
