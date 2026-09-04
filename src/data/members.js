// The `members` collection: identity + status, created by receptionists.
// Member numbers are PREFIX-#### and MUST be assigned inside a transaction
// against the gym's `member_seq` counter, so two concurrent registrations
// can never collide on the same number (BUILD.md §3).

import {
  collection,
  doc,
  getDoc,
  getDocs,
  runTransaction,
  updateDoc,
  query,
  where,
  serverTimestamp,
} from "firebase/firestore";
import { db, auth } from "./firebase";
import { stripUndefined } from "../lib/helpers";
import { formatMemberNumber } from "../logic/memberNumber";
import { localInvoke } from "./local/bridge";

/**
 * Register a new member. Bumps the gym's member_seq inside a transaction and
 * assigns the resulting PREFIX-#### number.
 */
export async function createMember({
  gymId,
  gymPrefix,
  name,
  phone,
  dob,
  gender,
  weight,
  height,
  emergencyName,
  emergencyPhone,
  email,
  address,
  customFields,
}) {
  if (window.gymOS?.isElectron) {
    return localInvoke("createMember", {
      gymId, gymPrefix, name, phone, dob, gender, weight, height,
      emergencyName, emergencyPhone, email, address, customFields,
      actorUid: auth.currentUser?.uid ?? null,
    });
  }

  const memberRef = doc(collection(db, "members"));
  const gymRef = doc(db, "gyms", gymId);

  return runTransaction(db, async (tx) => {
    const gymSnap = await tx.get(gymRef);
    if (!gymSnap.exists()) throw new Error("Gym not found");
    const nextSeq = (gymSnap.data().member_seq || 0) + 1;

    const record = stripUndefined({
      id: memberRef.id,
      gym_id: gymId,
      member_no: formatMemberNumber(gymPrefix, nextSeq),
      name: String(name).trim(),
      phone: String(phone).trim(),
      dob,
      gender,
      weight: weight ? Number(weight) : undefined,
      height: height ? Number(height) : undefined,
      date_joined: serverTimestamp(),
      emergency_name: emergencyName,
      emergency_phone: emergencyPhone,
      email,
      address,
      custom_fields: customFields && Object.keys(customFields).length > 0 ? customFields : undefined,
      active: true,
      created_at: serverTimestamp(),
      actor_uid: auth.currentUser?.uid ?? null,
    });

    tx.update(gymRef, { member_seq: nextSeq });
    tx.set(memberRef, record);
    return record;
  });
}

/**
 * Edit a member's bio-data (BUILD.md §15) — name, phone, dob, gender,
 * weight, height, emergency contact, email, address, custom fields.
 * NEVER touches member_no, gym_id, active, or date_joined (fixed at
 * registration; member_no/gym_id are further enforced server-side by
 * firestore.rules), and never touches anything transactional — payments,
 * membership records, attendance stay append-only, completely untouched
 * by this. Partial update: omit any field to leave it as-is.
 */
export async function updateMember(memberId, {
  name, phone, dob, gender, weight, height,
  emergencyName, emergencyPhone, email, address, customFields,
} = {}) {
  if (window.gymOS?.isElectron) {
    return localInvoke("updateMember", {
      memberId, name, phone, dob, gender, weight, height,
      emergencyName, emergencyPhone, email, address, customFields,
    });
  }
  return updateDoc(doc(db, "members", memberId), {
    ...stripUndefined({
      name: name !== undefined ? String(name).trim() : undefined,
      phone: phone !== undefined ? String(phone).trim() : undefined,
      dob,
      gender,
      weight: weight !== undefined ? (weight ? Number(weight) : null) : undefined,
      height: height !== undefined ? (height ? Number(height) : null) : undefined,
      emergency_name: emergencyName,
      emergency_phone: emergencyPhone,
      email,
      address,
      custom_fields: customFields,
    }),
    // Outside stripUndefined on purpose — every update stamps this, which
    // is what makes the Electron pull's updated_at cursor able to find
    // edits at all. `created_at` can't do that job: it never changes, so a
    // cursor ordered by it walks past a member once and never revisits.
    updated_at: serverTimestamp(),
  });
}

/** Fetch one member by id. Returns null if it doesn't exist. */
export async function getMember(memberId) {
  if (window.gymOS?.isElectron) return localInvoke("getMember", { memberId });
  const snap = await getDoc(doc(db, "members", memberId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

/** List a gym's members (single-field query — client-side search/sort). */
export async function listMembers(gymId) {
  if (window.gymOS?.isElectron) return localInvoke("listMembers", { gymId });
  const snap = await getDocs(query(collection(db, "members"), where("gym_id", "==", gymId)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * Search a gym's members by member number, phone, or name — partial,
 * case-insensitive. Used by the pre-registration duplicate check ("find and
 * renew, never duplicate" — BUILD.md §8).
 */
export async function searchMembers(gymId, queryText) {
  const q = String(queryText || "").trim().toLowerCase();
  if (!q) return [];
  const all = await listMembers(gymId);
  return all.filter(
    (m) =>
      m.member_no?.toLowerCase().includes(q) ||
      m.phone?.toLowerCase().includes(q) ||
      m.name?.toLowerCase().includes(q)
  );
}
