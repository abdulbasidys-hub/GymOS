// Local mirror of src/data/attendance.js's read functions. recordAttendance
// itself needs no counterpart here — it just calls appendRecord, already
// covered by ledger.cjs.

function rowToAttendance(row) {
  if (!row) return null;
  const { is_adjustment, ...rest } = row;
  return { ...rest, is_adjustment: !!is_adjustment };
}

function listAttendanceByGym(db, { gymId }) {
  return db.prepare("SELECT * FROM attendance WHERE gym_id = ?").all(gymId).map(rowToAttendance);
}

function listAttendanceByMember(db, { gymId, memberId }) {
  return db
    .prepare("SELECT * FROM attendance WHERE gym_id = ? AND member_id = ?")
    .all(gymId, memberId)
    .map(rowToAttendance);
}

module.exports = { listAttendanceByGym, listAttendanceByMember, rowToAttendance };
