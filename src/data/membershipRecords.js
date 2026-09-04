// The `membership_records` collection — FACT, append-only. Created whenever
// a receptionist takes a membership payment (registration or renewal).

import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "./firebase";
import { appendRecord } from "./ledger";
import { localInvoke } from "./local/bridge";

export function createMembershipRecord({ gymId, memberId, planId, planName, startDate, expiryDate, paymentId }) {
  return appendRecord("membership_records", {
    gym_id: gymId,
    member_id: memberId,
    plan_id: planId,
    plan_name: planName,
    start_date: startDate,
    expiry_date: expiryDate,
    payment_id: paymentId,
  });
}

/**
 * A single member's membership history (renewals included). Filters by BOTH
 * gym_id and member_id — see the same note on listPaymentsByMember in
 * data/payments.js.
 */
export async function listMembershipRecords(gymId, memberId) {
  if (window.gymOS?.isElectron) return localInvoke("listMembershipRecords", { gymId, memberId });
  const snap = await getDocs(
    query(
      collection(db, "membership_records"),
      where("gym_id", "==", gymId),
      where("member_id", "==", memberId)
    )
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/** Every membership record in a gym — used for the expiring-soon report. */
export async function listMembershipRecordsByGym(gymId) {
  if (window.gymOS?.isElectron) return localInvoke("listMembershipRecordsByGym", { gymId });
  const snap = await getDocs(query(collection(db, "membership_records"), where("gym_id", "==", gymId)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
