// Local mirror of the Owner-relevant parts of src/data/users.js (listStaff,
// setUserActive, setUserPhone, setUserEmail). createReceptionist has no
// local counterpart — the secondary-Firebase-app Auth-identity trick it
// uses is inherently online, so it stays Firestore-only. createOwner/
// listOwners/getOwnerForGym/createAffiliate/listAffiliates/
// setAffiliateBankDetails are admin/affiliate-only, also no local
// counterpart (BUILD.md §15 decision #3).
//
// Rows only ever arrive in the local `users` table via the bootstrap
// import (electron/local-db/bootstrap.cjs) — there's no local INSERT path
// here, matching that account creation stays an online-only operation.

function rowToUser(row) {
  if (!row) return null;
  return {
    ...row,
    active: !!row.active,
    must_change_password: !!row.must_change_password,
    // Multi-branch owners (BUILD.md §6) — JSON round-trip, same convention
    // as members.custom_fields. Absent/null for every non-owner row and
    // any owner row pulled before this field existed.
    gym_ids: row.gym_ids ? JSON.parse(row.gym_ids) : null,
  };
}

function getUserRecord(db, { uid }) {
  return rowToUser(db.prepare("SELECT * FROM users WHERE id = ?").get(uid));
}

function listStaff(db, { gymId }) {
  return db
    .prepare("SELECT * FROM users WHERE gym_id = ? AND role = 'receptionist'")
    .all(gymId)
    .map(rowToUser)
    .sort((a, b) => a.name.localeCompare(b.name));
}

// Every UPDATE below now also sets sync_status='pending' (BUILD.md §15,
// Phase 3) — without this, push's getPendingEntityRows query would never
// find a locally-edited receptionist, since bootstrap-imported rows start
// out 'synced' and nothing was flipping them back.
function setUserActive(db, { uid, active }) {
  db.prepare("UPDATE users SET active = ?, sync_status = 'pending' WHERE id = ?").run(active ? 1 : 0, uid);
}

function setUserPhone(db, { uid, phone }) {
  db.prepare("UPDATE users SET phone = ?, sync_status = 'pending' WHERE id = ?").run(String(phone).trim(), uid);
}

function setUserEmail(db, { uid, email }) {
  db.prepare("UPDATE users SET email = ?, sync_status = 'pending' WHERE id = ?").run(String(email).trim(), uid);
}

/** Mirrors a just-completed ONLINE Firestore write (src/data/accounts.js's
 *  changeOwnPassword, right after the forced first-login password change)
 *  — unlike setUserActive/etc. above, this is NOT a new local edit
 *  awaiting push; Firestore is already updated by the time this runs, so
 *  sync_status stays 'synced' (marking it 'pending' would just queue a
 *  redundant, already-applied push). Without this mirror, a confirmed
 *  bug: Electron's UI reads must_change_password from the LOCAL row once
 *  signed in (see accounts.js's watchUserRecord), so it never noticed a
 *  password change had gone through and kept re-showing SetPasswordPage
 *  indefinitely. */
function clearMustChangePassword(db, { uid }) {
  db.prepare("UPDATE users SET must_change_password = 0, sync_status = 'synced' WHERE id = ?").run(uid);
}

module.exports = { getUserRecord, listStaff, setUserActive, setUserPhone, setUserEmail, clearMustChangePassword, rowToUser };
