// Shared "is this gym okay" math for the super-admin dashboard, sync
// monitor, and the "needing attention" drill-down — pure, no storage, no UI.
// Kept in one place so the three screens can't drift on what counts as
// stale.

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * A gym's most recent attendance record stands in for "is this gym's
 * software still checking in" (see Sync Monitor — the web phase has no
 * literal offline sync queue yet).
 */
export function syncHealth(lastSeen, now = new Date()) {
  if (!lastSeen) return "never";
  const age = now.getTime() - lastSeen.getTime();
  if (age <= 2 * DAY_MS) return "healthy";
  if (age <= 7 * DAY_MS) return "stale";
  return "very-stale";
}

/**
 * One issue per gym, most urgent first — a gym can only be doing one thing
 * at a time from the super-admin's point of view. Returns null if the gym
 * looks healthy.
 */
export function issueFor({ status, remaining, health }) {
  if (status === "locked") return { issue: "Software locked", priority: "High" };
  if (status === "expired") return { issue: "Payment overdue", priority: "High" };
  if (status === "grace") return { issue: "Gym in grace period", priority: "Medium" };
  if (status === "active" && remaining != null && remaining <= 7) {
    return { issue: "Subscription expiring soon", priority: "Medium" };
  }
  if (health === "very-stale" || health === "never") {
    return { issue: "No recent sync", priority: "Low" };
  }
  return null;
}
