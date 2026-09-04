// The `platform_payments` collection — FACT, append-only. What an OWNER's
// account paid the PLATFORM for a subscription extension — one payment now
// covers every branch that owner manages (BUILD.md §6/§13's pooled-billing
// model), not one gym. `amount`/`plan_name` are copied from the plan as it
// stood at the moment of payment, so a later price change never rewrites
// history (same convention as payments.js). Records created before pooled
// billing carry the old `gym_id`/`gym_name` shape instead — left as
// historical data, never migrated (see Revenue.jsx's fallback rendering).

import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "./firebase";
import { appendRecord } from "./ledger";

/** Record an owner's payment to the platform for a subscription extension. */
export function createPlatformPayment({ ownerUid, ownerName, planId, planName, amount, durationDays }) {
  return appendRecord("platform_payments", {
    owner_uid: ownerUid,
    owner_name: ownerName,
    plan_id: planId,
    plan_name: planName,
    amount: Number(amount),
    duration_days: Number(durationDays),
    paid_at: new Date(),
  });
}

/** Every platform payment ever recorded — super-admin finances view. */
export async function listPlatformPayments() {
  const snap = await getDocs(query(collection(db, "platform_payments")));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/** One owner's payment history to the platform — OwnerDetailPage's billing tab. */
export async function listPlatformPaymentsByOwner(ownerUid) {
  const snap = await getDocs(query(collection(db, "platform_payments"), where("owner_uid", "==", ownerUid)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
