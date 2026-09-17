// TESTING-ONLY. Every other collection in this app follows one rule: nothing
// is ever hard-deleted, not even by super-admin (see the invariant at the top
// of firestore.rules) — real gyms are only ever suspended (gyms.js's
// suspendGym), so a paying customer's history can never vanish by accident.
//
// This file is the one deliberate exception, so gyms created while building
// and testing GymOS can be wiped clean before going live — every trace,
// right down to the platform's own audit log of actions taken on that gym.
// Once real gyms exist, DELETE: this file, its matching `allow delete`
// grants in firestore.rules (each tagged "TESTING ONLY"), and its one call
// site (admin/GymDetailPage.jsx's "Danger zone" card).
//
// Firebase Auth accounts for the gym's owner/receptionists are NOT deleted —
// the client SDK can only delete the currently signed-in user (the same
// limitation noted in data/users.js). Their `users/{uid}` Firestore docs are
// removed here, so if they ever try to
// sign in again they'll just land on "no account found." An affiliate
// marketer's OWN account is untouched either way — they aren't scoped to one
// gym, only their earnings FROM this gym (affiliate_earnings, by gym_id) go.

import { collection, query, where, getDocs, writeBatch, doc, deleteDoc, arrayRemove } from "firebase/firestore";
import { db } from "./firebase";

const GYM_SCOPED_COLLECTIONS = [
  "members",
  "payments",
  "attendance",
  "membership_records",
  "equipment_records",
  "adjustments",
  "plans",
  "custom_fields",
  "activity_log",
  "platform_payments",
  "admin_activity_log",
  "affiliate_earnings",
  "users",
];

const BATCH_LIMIT = 450; // Firestore caps a batch at 500 writes.

async function purgeCollection(collectionName, gymId) {
  const snap = await getDocs(query(collection(db, collectionName), where("gym_id", "==", gymId)));
  const refs = snap.docs.map((d) => d.ref);
  for (let i = 0; i < refs.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db);
    for (const ref of refs.slice(i, i + BATCH_LIMIT)) batch.delete(ref);
    await batch.commit();
  }
}

/**
 * Multi-branch owners reference their gyms in a `gym_ids` ARRAY, which the
 * gym_id-equality purge above can't see — it only matches the scalar
 * `gym_id`. Without this, deleting a branch left its id behind in the
 * owner's array, pointing at a gym that no longer exists. Harmless on its
 * own, but firestore.rules resolves access from that array, so it is one
 * bad edit away from an owner who can't reach their own gym.
 */
async function removeGymFromOwnerArrays(gymId) {
  const snap = await getDocs(
    query(collection(db, "users"), where("gym_ids", "array-contains", gymId))
  );
  if (snap.empty) return;
  const batch = writeBatch(db);
  for (const d of snap.docs) {
    batch.update(d.ref, { gym_ids: arrayRemove(gymId) });
  }
  await batch.commit();
}

/** Permanently erase a gym and every document that references it. */
export async function deleteGymAndAllData(gymId) {
  // Before the purge: this query needs the owner docs that the purge is
  // about to delete to still be there for any owner scoped to THIS gym,
  // and it must also reach owners of OTHER gyms who hold this one as a
  // branch — they survive the purge and would otherwise keep the stale id.
  await removeGymFromOwnerArrays(gymId);
  for (const name of GYM_SCOPED_COLLECTIONS) {
    await purgeCollection(name, gymId);
  }
  await deleteDoc(doc(db, "gyms", gymId));
}
