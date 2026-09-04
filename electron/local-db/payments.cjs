// Local mirror of src/data/payments.js's read functions. createPayment
// itself needs no counterpart here — it just calls appendRecord, already
// covered by ledger.cjs.

function rowToPayment(row) {
  if (!row) return null;
  const { for_type, is_adjustment, ...rest } = row;
  return { ...rest, for: for_type, is_adjustment: !!is_adjustment };
}

function listPaymentsByGym(db, { gymId }) {
  return db.prepare("SELECT * FROM payments WHERE gym_id = ?").all(gymId).map(rowToPayment);
}

function listPaymentsByMember(db, { gymId, memberId }) {
  return db
    .prepare("SELECT * FROM payments WHERE gym_id = ? AND member_id = ?")
    .all(gymId, memberId)
    .map(rowToPayment);
}

module.exports = { listPaymentsByGym, listPaymentsByMember, rowToPayment };
