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

import { collection, query, where, getDocs, writeBatch, doc, deleteDoc } from "firebase/firestore";
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

/** Permanently erase a gym and every document that references it. */
export async function deleteGymAndAllData(gymId) {
  for (const name of GYM_SCOPED_COLLECTIONS) {
    await purgeCollection(name, gymId);
  }
  await deleteDoc(doc(db, "gyms", gymId));
}
