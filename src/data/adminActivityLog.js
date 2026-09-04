// The `admin_activity_log` collection — FACT, append-only. A platform-level
// audit trail of super-admin actions on gyms (created, suspended,
// reactivated, subscription locked/unlocked/renewed) — distinct from
// `activity_log`, which tracks a GYM's OWN receptionist actions
// (registrations, payments, check-ins) and is scoped per-gym.
//
// Only real, currently-wired actions get logged here. "Offline activation
// code generated" — one of the super-admin dashboard's example activities —
// isn't logged because there's no offline/Electron client yet in the web
// phase. There's no admin-initiated password reset at all right now (see
// data/users.js) — it would need a server-side Cloud Function this project
// doesn't have.

import { collection, getDocs, query, orderBy, limit as fbLimit } from "firebase/firestore";
import { db } from "./firebase";
import { appendRecord } from "./ledger";

/**
 * Log one admin action. `status` is the resulting license-style state
 * ("active" | "grace" | "expired" | "locked") — used purely for display
 * colour, matching the same status-text convention used elsewhere.
 */
export function logAdminActivity({ gymId, gymName, activity, status, performedBy }) {
  return appendRecord("admin_activity_log", {
    gym_id: gymId,
    gym_name: gymName,
    activity,
    status,
    performed_by: performedBy || "Super Admin",
    at: new Date(),
  });
}

/** Most recent admin actions across every gym — the dashboard's activity feed. */
export async function listRecentAdminActivity(count = 12) {
  const snap = await getDocs(
    query(collection(db, "admin_activity_log"), orderBy("at", "desc"), fbLimit(count))
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
