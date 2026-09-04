// Local mirror of src/data/members.js. createMember is the one function in
// this whole local-db layer that needs a real transaction — Firestore's
// runTransaction exists to handle multiple BROWSER clients racing on one
// gym's member_seq counter; locally there's exactly one writer
// (better-sqlite3 is synchronous, one Node process), so the
// optimistic-retry machinery Firestore needs simply doesn't apply. This
// collapses to better-sqlite3's own .transaction() wrapper (auto BEGIN/
// COMMIT, auto-rollback on a thrown error).
//
// formatMemberNumber is duplicated from src/logic/memberNumber.js (a
// 3-line pure function) rather than required from it — that file is ESM,
// everything under electron/ is .cjs CommonJS by design, and require()
// can't load an ESM file directly. A dynamic import() would work but
// complicates an otherwise fully-synchronous transaction for a function
// this trivial and stable. Keep the two in sync if either ever changes.

const { newId, nowIso } = require("./helpers.cjs");

function formatMemberNumber(prefix, seq) {
  return `${prefix}-${String(seq).padStart(4, "0")}`;
}

function rowToMember(row) {
  if (!row) return null;
  const { custom_fields, active, ...rest } = row;
  return {
    ...rest,
    active: !!active,
    custom_fields: custom_fields ? JSON.parse(custom_fields) : undefined,
  };
}

function createMember(db, {
  gymId, gymPrefix, name, phone, dob, gender, weight, height,
  emergencyName, emergencyPhone, email, address, customFields, actorUid,
}) {
  const tx = db.transaction(() => {
    const gym = db.prepare("SELECT member_seq FROM gyms WHERE id = ?").get(gymId);
    if (!gym) throw new Error("Gym not found");

    const nextSeq = (gym.member_seq || 0) + 1;
    const member_no = formatMemberNumber(gymPrefix, nextSeq);
    const id = newId();
    const created_at = nowIso();
    const hasCustomFields = customFields && Object.keys(customFields).length > 0;

    db.prepare("UPDATE gyms SET member_seq = ? WHERE id = ?").run(nextSeq, gymId);

    db.prepare(
      `INSERT INTO members (
        id, gym_id, member_no, name, phone, dob, gender, weight, height,
        date_joined, emergency_name, emergency_phone, email, address,
        custom_fields, active, created_at, actor_uid, sync_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, 'pending')`
    ).run(
      id, gymId, member_no, String(name).trim(), String(phone).trim(),
      dob ?? null, gender ?? null, weight ? Number(weight) : null, height ? Number(height) : null,
      created_at, emergencyName ?? null, emergencyPhone ?? null, email ?? null, address ?? null,
      hasCustomFields ? JSON.stringify(customFields) : null,
      created_at, actorUid ?? null
    );

    return rowToMember(db.prepare("SELECT * FROM members WHERE id = ?").get(id));
  });

  return tx();
}

function getMember(db, { memberId }) {
  return rowToMember(db.prepare("SELECT * FROM members WHERE id = ?").get(memberId));
}

function listMembers(db, { gymId }) {
  return db.prepare("SELECT * FROM members WHERE gym_id = ?").all(gymId).map(rowToMember);
}

// Bio-data only — never member_no/gym_id/active/date_joined (those stay
// fixed after registration; member_no/gym_id are further enforced
// server-side by firestore.rules on the web path). Same "read current,
// fall back per-field on undefined, single UPDATE + sync_status='pending'"
// pattern as plans.cjs's updatePlan/customFields.cjs's updateCustomField.
function updateMember(db, {
  memberId, name, phone, dob, gender, weight, height,
  emergencyName, emergencyPhone, email, address, customFields,
}) {
  const current = db.prepare("SELECT * FROM members WHERE id = ?").get(memberId);
  if (!current) throw new Error("Member not found");
  const hasCustomFields = customFields !== undefined
    ? (customFields && Object.keys(customFields).length > 0)
    : undefined;

  db.prepare(
    `UPDATE members SET
      name = ?, phone = ?, dob = ?, gender = ?, weight = ?, height = ?,
      emergency_name = ?, emergency_phone = ?, email = ?, address = ?, custom_fields = ?,
      sync_status = 'pending'
     WHERE id = ?`
  ).run(
    name !== undefined ? String(name).trim() : current.name,
    phone !== undefined ? String(phone).trim() : current.phone,
    dob !== undefined ? dob : current.dob,
    gender !== undefined ? gender : current.gender,
    weight !== undefined ? (weight ? Number(weight) : null) : current.weight,
    height !== undefined ? (height ? Number(height) : null) : current.height,
    emergencyName !== undefined ? emergencyName : current.emergency_name,
    emergencyPhone !== undefined ? emergencyPhone : current.emergency_phone,
    email !== undefined ? email : current.email,
    address !== undefined ? address : current.address,
    hasCustomFields !== undefined ? (hasCustomFields ? JSON.stringify(customFields) : null) : current.custom_fields,
    memberId
  );

  return rowToMember(db.prepare("SELECT * FROM members WHERE id = ?").get(memberId));
}

/** Mirrors a photo URL that Firebase Storage + Firestore have ALREADY
 *  accepted onto the local row, so the photo shows on this device
 *  immediately instead of waiting for a pull that (being cursor-ordered on
 *  created_at) may never revisit an existing member.
 *
 *  Deliberately leaves sync_status alone rather than marking 'pending':
 *  the authoritative write already happened in Firestore — see
 *  src/data/memberPhotos.js, which only calls this after that succeeds.
 *  Marking it pending would queue a redundant push, and worse, would make
 *  applyPulledMembersPage skip the row on future pulls (it refuses to
 *  overwrite pending rows), freezing every other field on this device. */
function setMemberPhotoUrl(db, { memberId, photoUrl }) {
  db.prepare("UPDATE members SET photo_url = ? WHERE id = ?").run(photoUrl ?? null, memberId);
  return rowToMember(db.prepare("SELECT * FROM members WHERE id = ?").get(memberId));
}

// No searchMembers here — src/data/members.js's searchMembers is a pure
// client-side filter over listMembers()'s own result on both the web and
// Electron paths, so it stays unbranched and just calls the already-
// branched listMembers rather than needing its own IPC operation.

module.exports = { createMember, getMember, listMembers, updateMember, setMemberPhotoUrl, rowToMember, formatMemberNumber };
