// Local mirror of src/data/activityLog.js's read function. logActivity
// itself needs no counterpart here — it just calls appendRecord, already
// covered by ledger.cjs.

function rowToActivity(row) {
  if (!row) return null;
  const { is_adjustment, ...rest } = row;
  return { ...rest, is_adjustment: !!is_adjustment };
}

function listActivityByGym(db, { gymId }) {
  return db.prepare("SELECT * FROM activity_log WHERE gym_id = ?").all(gymId).map(rowToActivity);
}

module.exports = { listActivityByGym, rowToActivity };
