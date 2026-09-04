// Local mirror of src/data/equipmentRecords.js's read functions.
// createEquipmentRecord itself needs no counterpart here — it just calls
// appendRecord, already covered by ledger.cjs.

function rowToEquipmentRecord(row) {
  if (!row) return null;
  const { is_adjustment, ...rest } = row;
  return { ...rest, is_adjustment: !!is_adjustment };
}

function listEquipmentRecords(db, { gymId, memberId }) {
  return db
    .prepare("SELECT * FROM equipment_records WHERE gym_id = ? AND member_id = ?")
    .all(gymId, memberId)
    .map(rowToEquipmentRecord);
}

function listEquipmentRecordsByGym(db, { gymId }) {
  return db.prepare("SELECT * FROM equipment_records WHERE gym_id = ?").all(gymId).map(rowToEquipmentRecord);
}

module.exports = { listEquipmentRecords, listEquipmentRecordsByGym, rowToEquipmentRecord };
