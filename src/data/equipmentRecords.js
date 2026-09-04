// The `equipment_records` collection — FACT, append-only. Time-based, NOT
// visit-based: an equipment plan expires by the clock whether or not the
// member showed up (BUILD.md §8).

import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "./firebase";
import { appendRecord } from "./ledger";
import { localInvoke } from "./local/bridge";

export function createEquipmentRecord({ gymId, memberId, planId, planName, startDate, expiryDate, paymentId }) {
  return appendRecord("equipment_records", {
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
 * A single member's equipment-access history (renewals included). Filters by
 * BOTH gym_id and member_id — see the same note on listPaymentsByMember in
 * data/payments.js.
 */
export async function listEquipmentRecords(gymId, memberId) {
  if (window.gymOS?.isElectron) return localInvoke("listEquipmentRecords", { gymId, memberId });
  const snap = await getDocs(
    query(
      collection(db, "equipment_records"),
      where("gym_id", "==", gymId),
      where("member_id", "==", memberId)
    )
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/** Every equipment record in a gym — used for the expiring-soon report. */
export async function listEquipmentRecordsByGym(gymId) {
  if (window.gymOS?.isElectron) return localInvoke("listEquipmentRecordsByGym", { gymId });
  const snap = await getDocs(query(collection(db, "equipment_records"), where("gym_id", "==", gymId)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
