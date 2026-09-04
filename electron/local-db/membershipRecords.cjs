// Local mirror of src/data/membershipRecords.js's read functions.
// createMembershipRecord itself needs no counterpart here — it just calls
// appendRecord, already covered by ledger.cjs.

function rowToMembershipRecord(row) {
  if (!row) return null;
  const { is_adjustment, ...rest } = row;
  return { ...rest, is_adjustment: !!is_adjustment };
}

function listMembershipRecords(db, { gymId, memberId }) {
  return db
    .prepare("SELECT * FROM membership_records WHERE gym_id = ? AND member_id = ?")
    .all(gymId, memberId)
    .map(rowToMembershipRecord);
}

function listMembershipRecordsByGym(db, { gymId }) {
  return db.prepare("SELECT * FROM membership_records WHERE gym_id = ?").all(gymId).map(rowToMembershipRecord);
}

module.exports = { listMembershipRecords, listMembershipRecordsByGym, rowToMembershipRecord };
