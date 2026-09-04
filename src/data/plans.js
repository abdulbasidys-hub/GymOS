// The `plans` collection: membership tiers + equipment plans. Mutable
// entities — owners edit price/duration or retire a plan — but NEVER
// hard-delete. Payments freeze their own amount at purchase time, so a later
// price change never touches old history.

import {
  collection,
  doc,
  setDoc,
  updateDoc,
  getDocs,
  query,
  where,
  serverTimestamp,
} from "firebase/firestore";
import { db, auth } from "./firebase";
import { stripUndefined } from "../lib/helpers";
import { localInvoke } from "./local/bridge";

/**
 * Create a plan. `type` is "membership" (always 1 year) or "equipment"
 * (owner-defined duration).
 */
export async function createPlan({ gymId, type, name, price, durationCount, durationUnit }) {
  if (window.gymOS?.isElectron) {
    return localInvoke("createPlan", {
      gymId, type, name, price, durationCount, durationUnit,
      actorUid: auth.currentUser?.uid ?? null,
    });
  }

  const ref = doc(collection(db, "plans"));
  const plan = stripUndefined({
    id: ref.id,
    gym_id: gymId,
    type,
    name: String(name).trim(),
    duration_count: type === "membership" ? 1 : Number(durationCount),
    duration_unit: type === "membership" ? "year" : durationUnit,
    price: Number(price),
    active: true,
    created_at: serverTimestamp(),
    actor_uid: auth.currentUser?.uid ?? null,
  });
  await setDoc(ref, plan);
  return plan;
}

/** List a gym's plans (single-field query — sort client-side). */
export async function listPlans(gymId) {
  if (window.gymOS?.isElectron) return localInvoke("listPlans", { gymId });
  const snap = await getDocs(query(collection(db, "plans"), where("gym_id", "==", gymId)));
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Update a plan's editable fields. Never touches gym_id/type. */
export function updatePlan(planId, { name, price, durationCount, durationUnit }) {
  if (window.gymOS?.isElectron) return localInvoke("updatePlan", { planId, name, price, durationCount, durationUnit });
  return updateDoc(
    doc(db, "plans", planId),
    stripUndefined({
      name: name?.trim(),
      price: price != null ? Number(price) : undefined,
      duration_count: durationCount != null ? Number(durationCount) : undefined,
      duration_unit: durationUnit,
    })
  );
}

/** Retire a plan — hides it from new sales, keeps it for history. Never hard-deleted. */
export function retirePlan(planId) {
  if (window.gymOS?.isElectron) return localInvoke("retirePlan", { planId });
  return updateDoc(doc(db, "plans", planId), { active: false });
}

/** Reactivate a retired plan. */
export function reactivatePlan(planId) {
  if (window.gymOS?.isElectron) return localInvoke("reactivatePlan", { planId });
  return updateDoc(doc(db, "plans", planId), { active: true });
}
