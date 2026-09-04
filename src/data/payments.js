// The `payments` collection — FACT, append-only, `amount` FROZEN at the
// moment of purchase so a later plan price change never touches history.

import { collection, getDocs, query, where } from "firebase/firestore";
import { db, auth } from "./firebase";
import { appendRecord } from "./ledger";
import { localInvoke } from "./local/bridge";

/**
 * Record a payment. `amount`/`planName`/`planType` are copied from the plan
 * as it stands right now — this function never re-reads the plan later.
 * `forType` is "membership" | "equipment". `durationCount`/`durationUnit` are
 * ALSO frozen from the plan at payment time — for an equipment payment, the
 * matching equipment_record isn't created until the member's next attendance
 * (MemberProfile.jsx — access doesn't start counting down until they actually
 * show up), so that later activation step needs the plan's duration as it
 * stood at PAYMENT time, not whatever the plan looks like by then.
 */
export function createPayment({
  gymId,
  memberId,
  planId,
  planName,
  planType,
  amount,
  forType,
  durationCount,
  durationUnit,
}) {
  return appendRecord("payments", {
    gym_id: gymId,
    member_id: memberId,
    receptionist_uid: auth.currentUser?.uid ?? null,
    plan_id: planId,
    plan_name: planName,
    plan_type: planType,
    amount: Number(amount),
    for: forType,
    duration_count: durationCount,
    duration_unit: durationUnit,
    paid_at: new Date(),
  });
}

/** All payments for a gym (single-field query — filter/sort client-side). */
export async function listPaymentsByGym(gymId) {
  if (window.gymOS?.isElectron) return localInvoke("listPaymentsByGym", { gymId });
  const snap = await getDocs(query(collection(db, "payments"), where("gym_id", "==", gymId)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * A single member's payment history. Filters by BOTH gym_id and member_id —
 * the rule gates reads on gym_id, and Firestore can only prove a list query
 * safe when its filters cover every field the rule depends on.
 */
export async function listPaymentsByMember(gymId, memberId) {
  if (window.gymOS?.isElectron) return localInvoke("listPaymentsByMember", { gymId, memberId });
  const snap = await getDocs(
    query(collection(db, "payments"), where("gym_id", "==", gymId), where("member_id", "==", memberId))
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
