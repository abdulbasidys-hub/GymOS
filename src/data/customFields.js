// The `custom_fields` collection: extra questions a gym's owner wants
// collected at member registration, beyond the built-in set (RegisterMember.jsx).
// Mostly the same mutable shape as plans.js — an owner can retire a field so
// it stops appearing on new registrations, but past members' answers (stored
// on their own `members/{id}.custom_fields`) stay intact. Unlike plans, a
// field CAN also be hard-deleted outright (deleteCustomField) — the owner may
// just want the question gone, not kept around for history. Old members who
// already answered it keep their answer; MemberProfile falls back to showing
// the raw field id as a label if the definition is gone.

import {
  collection,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  query,
  where,
  serverTimestamp,
} from "firebase/firestore";
import { db, auth } from "./firebase";
import { stripUndefined, toDate } from "../lib/helpers";
import { localInvoke } from "./local/bridge";

/** `type` is "text" | "number" | "yesno". */
export async function createCustomField({ gymId, label, type, required }) {
  if (window.gymOS?.isElectron) {
    return localInvoke("createCustomField", { gymId, label, type, required, actorUid: auth.currentUser?.uid ?? null });
  }

  const ref = doc(collection(db, "custom_fields"));
  const field = stripUndefined({
    id: ref.id,
    gym_id: gymId,
    label: String(label).trim(),
    type,
    required: !!required,
    active: true,
    created_at: serverTimestamp(),
    actor_uid: auth.currentUser?.uid ?? null,
  });
  await setDoc(ref, field);
  return field;
}

/**
 * List a gym's custom fields, oldest first (the order the owner added them —
 * a reasonable default registration-form order). Includes retired fields;
 * callers that render the registration form filter to `active !== false`
 * themselves (same pattern as PlanPicker.jsx with plans).
 */
export async function listCustomFields(gymId) {
  if (window.gymOS?.isElectron) return localInvoke("listCustomFields", { gymId });
  const snap = await getDocs(query(collection(db, "custom_fields"), where("gym_id", "==", gymId)));
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (toDate(a.created_at)?.getTime() ?? 0) - (toDate(b.created_at)?.getTime() ?? 0));
}

/** Update a field's editable properties. Never touches gym_id. */
export function updateCustomField(fieldId, { label, type, required }) {
  if (window.gymOS?.isElectron) return localInvoke("updateCustomField", { fieldId, label, type, required });
  return updateDoc(
    doc(db, "custom_fields", fieldId),
    stripUndefined({
      label: label?.trim(),
      type,
      required: required != null ? !!required : undefined,
    })
  );
}

/** Retire a field — hides it from new registrations, keeps it for history. */
export function retireCustomField(fieldId) {
  if (window.gymOS?.isElectron) return localInvoke("retireCustomField", { fieldId });
  return updateDoc(doc(db, "custom_fields", fieldId), { active: false });
}

/** Reactivate a retired field. */
export function reactivateCustomField(fieldId) {
  if (window.gymOS?.isElectron) return localInvoke("reactivateCustomField", { fieldId });
  return updateDoc(doc(db, "custom_fields", fieldId), { active: true });
}

/** Permanently remove a field definition — unlike retire, this can't be undone. */
export function deleteCustomField(fieldId) {
  if (window.gymOS?.isElectron) return localInvoke("deleteCustomField", { fieldId });
  return deleteDoc(doc(db, "custom_fields", fieldId));
}
