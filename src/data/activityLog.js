// The `activity_log` collection — FACT, append-only. Powers the owner's
// staff-activity feed (BUILD.md §9): a plain trail of who did what.

import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "./firebase";
import { appendRecord } from "./ledger";
import { localInvoke } from "./local/bridge";

/** Log one staff action. `action` is a short verb phrase, `target` a label. */
export function logActivity({ gymId, action, target }) {
  return appendRecord("activity_log", { gym_id: gymId, action, target, at: new Date() });
}

/**
 * A gym's full activity log (single-field query — sort client-side). Also
 * powers the "Recent activity" section of the super-admin's gym detail page.
 */
export async function listActivityByGym(gymId) {
  if (window.gymOS?.isElectron) return localInvoke("listActivityByGym", { gymId });
  const snap = await getDocs(query(collection(db, "activity_log"), where("gym_id", "==", gymId)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
