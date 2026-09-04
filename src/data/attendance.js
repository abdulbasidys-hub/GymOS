// The `attendance` collection — FACT, append-only. Always a deliberate
// button click, never automatic (BUILD.md §8): scanning/searching only opens
// a profile.

import { collection, getDocs, query, where } from "firebase/firestore";
import { db, auth } from "./firebase";
import { appendRecord } from "./ledger";
import { localInvoke } from "./local/bridge";

/** Record one attendance event. */
export function recordAttendance({ gymId, memberId }) {
  return appendRecord("attendance", {
    gym_id: gymId,
    member_id: memberId,
    receptionist_uid: auth.currentUser?.uid ?? null,
    recorded_at: new Date(),
  });
}

/** All attendance for a gym (single-field query — filter/sort client-side). */
export async function listAttendanceByGym(gymId) {
  if (window.gymOS?.isElectron) return localInvoke("listAttendanceByGym", { gymId });
  const snap = await getDocs(query(collection(db, "attendance"), where("gym_id", "==", gymId)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * A single member's attendance history. Filters by BOTH gym_id and
 * member_id — see the same note on listPaymentsByMember in payments.js.
 */
export async function listAttendanceByMember(gymId, memberId) {
  if (window.gymOS?.isElectron) return localInvoke("listAttendanceByMember", { gymId, memberId });
  const snap = await getDocs(
    query(collection(db, "attendance"), where("gym_id", "==", gymId), where("member_id", "==", memberId))
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
