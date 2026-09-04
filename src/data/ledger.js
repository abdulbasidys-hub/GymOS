// The append-only ledger core.
//
// GymOS never overwrites or deletes facts. Every record is created once and
// stays forever; corrections are new records (adjustments) that reference the
// original. This module is the single doorway every write passes through, so
// every record is guaranteed to carry the same universal fields:
//
//   id          — unique, stable
//   actor_uid   — WHO did it (the signed-in user)
//   created_at  — WHEN (server clock, not the browser's)
//   sync_status — where this record is in its journey to the cloud
//
// In the web phase we write straight to Firestore, so sync_status is "synced"
// immediately. In the Electron phase, the local layer will write "pending"
// first and flip it to "synced" once it reaches the cloud — but the SHAPE of
// every record is already correct today, so that change touches only src/data/.
//
// The real guarantee that nothing is ever updated or deleted lives in
// firestore.rules on the server. This module is the matching client-side
// convention.

import { collection, doc, setDoc, serverTimestamp } from "firebase/firestore";
import { db, auth } from "./firebase";
import { stripUndefined } from "../lib/helpers";
import { localInvoke } from "./local/bridge";

/**
 * Append a new record to a collection. Never updates, never deletes.
 * @param {string} collectionName  e.g. "attendance", "payments"
 * @param {object} data            domain fields (gym_id, member_id, amount, ...)
 * @returns {Promise<object>}      the stored record (including its generated id)
 */
export async function appendRecord(collectionName, data) {
  const actorUid = auth.currentUser?.uid ?? null;

  if (window.gymOS?.isElectron) {
    return localInvoke("appendRecord", { collectionName, data: stripUndefined(data), actorUid });
  }

  const ref = doc(collection(db, collectionName)); // Firestore-generated id
  const record = stripUndefined({
    ...data,
    id: ref.id,
    actor_uid: actorUid,
    created_at: serverTimestamp(),
    sync_status: "synced", // web phase: cloud is the direct target
  });

  await setDoc(ref, record);
  return record;
}

/**
 * Append an adjustment — a correction that points back at an original record
 * instead of changing it. This is how GymOS "edits" the ledger.
 * @param {string} collectionName  the collection being corrected
 * @param {string} originalId      the record this adjustment corrects
 * @param {object} data            the corrected values + a reason
 */
export async function appendAdjustment(collectionName, originalId, data) {
  return appendRecord(collectionName, {
    ...data,
    adjusts_id: originalId,
    is_adjustment: true,
  });
}
