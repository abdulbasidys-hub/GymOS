// Who is signed in, and what they're allowed to be.
//
// AuthProvider watches Firebase auth. When someone signs in, it loads their
// `users/{uid}` record to learn their role and gym. Everything downstream reads
// this via useAuth(). Remember: this routing is UX convenience — the REAL
// permission enforcement is firestore.rules on the server.

import { createContext, useContext, useEffect, useState } from "react";
import { watchAuth, signOutUser, watchUserRecord, watchGym, getGym } from "./data";
import { ensureBootstrapped } from "./data/local/bootstrap";
import { pushPendingChanges } from "./data/local/sync";
import { pullRemoteChanges, pullFactAndMembers } from "./data/local/pull";
import { advanceForwardClock } from "./data/local/clock";
import { localInvoke } from "./data/local/bridge";
import { licenseStatus } from "./logic/license";
import { useIdleTimeout } from "./hooks/useIdleTimeout";
import SyncToast from "./components/SyncToast";

const AuthContext = createContext(null);
const isElectron = () => !!window.gymOS?.isElectron;

// Hourly — was every 5 minutes; widened per explicit request once the
// popup below made "how often does this run" actually visible/felt,
// rather than a silent background detail. Reconnect (the `online` event
// listener below) still syncs immediately regardless of this interval.
const SYNC_INTERVAL_MS = 60 * 60 * 1000;
const CLOCK_TICK_MS = 60 * 1000;

// Multi-branch owners (BUILD.md §6): every gym this account can act
// against. A real `gym_ids` array for an owner with more than one branch;
// everyone else (receptionists, affiliates, superadmin, and any owner
// signed up before this field existed) falls back to their single scalar
// `gym_id` — the client-side mirror of firestore.rules' own myGymIds().
function resolveGymIds(account) {
  if (account?.gym_ids?.length) return account.gym_ids;
  if (account?.gym_id) return [account.gym_id];
  return [];
}

export function AuthProvider({ children }) {
  // status: "loading" | "signedOut" | "ready" | "noAccount"
  const [status, setStatus] = useState("loading");
  const [user, setUser] = useState(null);       // Firebase auth user
  const [account, setAccount] = useState(null); // users/{uid}: { role, gym_id, gym_ids?, name }
  const [gym, setGym] = useState(null);         // gyms/{activeGymId}: live, for status/subscription

  // Multi-branch owners (BUILD.md §6): which of the account's gym_ids is
  // currently being viewed/managed, and (owners with >1 branch only) the
  // full gym docs for the switcher. Every other role's activeGymId is
  // always just their one gym_id — see the effect below.
  const [activeGymId, setActiveGymIdState] = useState(null);
  const [branches, setBranches] = useState([]);

  // Electron/offline (BUILD.md §15, Milestone 3 — §6 pooled multi-branch
  // sync): per-branch sync bookkeeping, keyed by gym id — every branch an
  // owner manages stays continuously synced in the background (BUILD.md
  // §6), not just the one currently active, so this can't be a single
  // flat status/timestamp/count the way it was pre-multi-branch. The
  // context value below aggregates this into the same
  // syncStatus/lastSyncedAt/pendingCount shape every screen already reads.
  // Meaningless on the web build (nothing ever sets it there).
  const [branchSyncState, setBranchSyncState] = useState({}); // { [gymId]: { status, lastSyncedAt, pendingCount } }
  // Result popup for a MANUALLY-triggered sync only — see SyncToast's own
  // comment on why the automatic background cycle never sets this.
  const [syncToast, setSyncToast] = useState(null); // { type: "success" | "error", message, id } | null

  // Phase 4 (BUILD.md §13): forward-only clock for offline license
  // enforcement — see data/local/clock.js. Unused on the web build, where
  // isLocked below always evaluates against the raw wall clock instead.
  const [licenseNow, setLicenseNow] = useState(() => new Date());

  useEffect(() => {
    let unsubAccount = null;
    const unsubAuth = watchAuth((fbUser) => {
      if (unsubAccount) {
        unsubAccount();
        unsubAccount = null;
      }
      if (!fbUser) {
        setUser(null);
        setAccount(null);
        setStatus("signedOut");
        return;
      }
      setUser(fbUser);
      // Live, not one-shot — so clearing must_change_password (or an owner
      // deactivating this user mid-session) is reflected without a re-login.
      unsubAccount = watchUserRecord(fbUser.uid, (record) => {
        if (record) {
          setAccount(record);
          setStatus("ready");
        } else {
          setAccount(null);
          setStatus("noAccount");
        }
      });
    });
    return () => {
      unsubAuth();
      if (unsubAccount) unsubAccount();
    };
  }, []);

  // Which gym is "active" right now. Non-owners (receptionist/affiliate/
  // superadmin) are never multi-branch — always exactly their own gym_id,
  // no persistence needed. An owner's choice survives reloads via
  // localStorage, scoped to their own uid so a shared device signing in as
  // a different owner doesn't inherit someone else's last-picked branch;
  // defaults to their primary gym_id if nothing stored yet, or if the
  // stored value isn't (or is no longer) one of their gym_ids.
  useEffect(() => {
    if (!account) {
      setActiveGymIdState(null);
      return;
    }
    const gymIds = resolveGymIds(account);
    if (account.role !== "owner" || gymIds.length <= 1) {
      setActiveGymIdState(account.gym_id ?? gymIds[0] ?? null);
      return;
    }
    let stored = null;
    try {
      stored = user?.uid ? localStorage.getItem(`gymos-active-gym-${user.uid}`) : null;
    } catch {}
    setActiveGymIdState(stored && gymIds.includes(stored) ? stored : account.gym_id ?? gymIds[0]);
  }, [account?.role, account?.gym_id, account?.gym_ids?.join(","), user?.uid]);

  function setActiveGym(gymId) {
    setActiveGymIdState(gymId);
    if (user?.uid) {
      try {
        localStorage.setItem(`gymos-active-gym-${user.uid}`, gymId);
      } catch {}
    }
  }

  // Owners with more than one branch (BUILD.md §6) — the full gym docs the
  // sidebar switcher and CrossBranchReport.jsx need. Empty for everyone
  // else, including a single-branch owner (nothing to switch between).
  useEffect(() => {
    const gymIds = resolveGymIds(account);
    if (account?.role !== "owner" || gymIds.length <= 1) {
      setBranches([]);
      return;
    }
    let alive = true;
    Promise.all(gymIds.map((gid) => getGym(gid)))
      .then((gyms) => alive && setBranches(gyms.filter(Boolean)))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [account?.role, account?.gym_id, account?.gym_ids?.join(",")]);

  // Superadmin has no gym at all — gym stays null for them, which is
  // correct: the platform operator isn't subject to any single gym's lock
  // state.
  useEffect(() => {
    if (!activeGymId) {
      setGym(null);
      return;
    }
    return watchGym(activeGymId, setGym);
  }, [activeGymId]);

  // Electron/offline (BUILD.md §15/§6): one push→pull→pull sync cycle for
  // ONE branch — everything locally-pending reaching Firestore, then
  // Firestore's current entities (gyms/plans/custom_fields/users) and the
  // FACT tables + members (cursor-paged) coming back down. Sequential
  // within a branch, not racing: pull must run after push, never before —
  // pull's local-always-wins conflict policy only holds if a
  // locally-pending row already had its chance to reach Firestore before a
  // stale remote copy could otherwise overwrite it. No-op outside Electron
  // (each of the three calls already guards on window.gymOS?.isElectron
  // itself).
  //
  // A multi-branch owner has one of these running per branch (BUILD.md
  // §6: every branch stays synced continuously, not just the active one)
  // — so this updates only ITS OWN entry in branchSyncState rather than a
  // single flat status/timestamp/count; the context value aggregates
  // across every branch. Returns { ok } so callers orchestrating several
  // branches at once (syncNow below) can decide on ONE combined toast
  // instead of one per branch.
  async function runSyncCycle(gymId) {
    if (!isElectron() || !gymId) return { ok: true };
    setBranchSyncState((s) => ({ ...s, [gymId]: { ...s[gymId], status: "syncing" } }));
    let ok = true;
    let pushErrors = [];
    try {
      // pushPendingChanges never throws on a per-record rejection — it
      // deliberately keeps going so one bad row can't strand a day of
      // payments — so its RETURN VALUE is the only signal that anything
      // failed. Ignoring it is what let a rules-denied member push report
      // "Synced successfully" while the record stayed pending on the
      // device, invisible everywhere else.
      const pushResult = await pushPendingChanges(gymId);
      if (pushResult?.failedCount > 0) {
        ok = false;
        pushErrors = pushResult.errors || [];
      }
      await pullRemoteChanges(gymId);
      await pullFactAndMembers(gymId);
    } catch (err) {
      console.error("Sync cycle failed (will retry):", err);
      ok = false;
    }
    let pendingCount = 0;
    try {
      pendingCount = await localInvoke("getPendingCount", { gymId });
    } catch {
      // best-effort badge only — a failure here shouldn't mask the cycle's own status above
    }
    setBranchSyncState((s) => ({
      ...s,
      [gymId]: {
        status: ok ? "idle" : "error",
        lastSyncedAt: ok ? new Date() : s[gymId]?.lastSyncedAt ?? null,
        pendingCount,
      },
    }));
    return { ok, errors: pushErrors };
  }

  // Runs once per sign-in, right after bootstrap — the one place a real
  // sign-in with resolved gym_ids is known, which is exactly the right
  // signal for "does this device have anything to work with locally yet"
  // (ensureBootstrapped, also a no-op once local data already exists —
  // see its own doc comment) and "run a sync cycle now." Sequential across
  // branches — a first-run multi-branch seed writes a lot to the same
  // local SQLite file at once; sequential keeps that predictable at the
  // cost of a longer one-time sign-in, a fine trade for a rare event.
  useEffect(() => {
    const gymIds = resolveGymIds(account);
    if (gymIds.length === 0) return;
    let cancelled = false;
    (async () => {
      for (const gid of gymIds) {
        await ensureBootstrapped(gid);
      }
      for (const gid of gymIds) {
        if (cancelled) return;
        await runSyncCycle(gid);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [account?.gym_id, account?.gym_ids?.join(",")]);

  // Milestone 3 (BUILD.md §15), extended for §6: keep every branch syncing
  // after that first cycle — every hour, and immediately whenever the OS
  // reports connectivity returning (a real signal, not polling). Runs all
  // branches in parallel here (unlike the one-time bootstrap above) —
  // lighter incremental cycles, and syncNow needs them settled together
  // for its one combined toast anyway. Electron-only; a plain no-op effect
  // on the web build.
  useEffect(() => {
    if (!isElectron()) return;
    const gymIds = resolveGymIds(account);
    if (gymIds.length === 0) return;
    const cycleAll = () => gymIds.forEach((gid) => runSyncCycle(gid));
    const interval = setInterval(cycleAll, SYNC_INTERVAL_MS);
    window.addEventListener("online", cycleAll);
    return () => {
      clearInterval(interval);
      window.removeEventListener("online", cycleAll);
    };
  }, [account?.gym_id, account?.gym_ids?.join(",")]);

  // Phase 4 (BUILD.md §13): refresh the forward-only clock anchor when the
  // gym resolves and every 60s after, so a long-open offline session that
  // crosses the grace boundary locks without needing a restart. Electron-
  // only — licenseNow is never read on the web build (see isLocked below).
  useEffect(() => {
    if (!gym?.id || !isElectron()) return;
    let cancelled = false;
    async function tick() {
      const now = await advanceForwardClock(gym.id);
      if (!cancelled) setLicenseNow(now);
    }
    tick();
    const interval = setInterval(tick, CLOCK_TICK_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [gym?.id]);

  // Phase 4 (BUILD.md §13, "Option A"): web behavior is unchanged — only
  // gates on "locked" (suspended/instant-locked), evaluated against the
  // raw wall clock, exactly as before (the server, via firestore.rules'
  // gymIsOperational(), is the real enforcement there). Electron
  // additionally gates on "expired" (past grace) using the forward-only
  // clock — the literal §13 spec ("self-locks 24h after it passes") —
  // since nothing server-side polices elapsed time once data is local.
  // "grace" (past expiry, still inside the 24h window) intentionally does
  // not lock, on either platform.
  const electron = isElectron();
  const licenseState = gym ? licenseStatus(gym, electron ? licenseNow : new Date()) : null;
  const isLocked = !!gym && (licenseState === "locked" || (electron && licenseState === "expired"));

  // Idle auto-logout (BUILD.md §15) — universal: every platform, every
  // role, 30 minutes. An unattended signed-in desk (offline, where this
  // was the original concern) or a browser tab left open shouldn't stay
  // usable indefinitely. No-op until status is actually "ready" (not on
  // the login screen, not while still loading).
  useIdleTimeout(status === "ready", signOutUser);

  // Aggregated across every branch this account manages (BUILD.md §6) —
  // "syncing" if any branch's cycle is currently running, else "error" if
  // any branch's last attempt failed, else idle; pendingCount summed
  // across branches; lastSyncedAt the most recent successful sync of any
  // of them. A single-branch account's values are identical to reading
  // that one branch's own state directly, so nothing about the existing
  // sync-icon UI needed to change for this.
  const syncGymIds = resolveGymIds(account);
  const syncStatus = syncGymIds.some((g) => branchSyncState[g]?.status === "syncing")
    ? "syncing"
    : syncGymIds.some((g) => branchSyncState[g]?.status === "error")
    ? "error"
    : "idle";
  const pendingCount = syncGymIds.reduce((sum, g) => sum + (branchSyncState[g]?.pendingCount || 0), 0);
  const lastSyncedAt = syncGymIds.reduce((latest, g) => {
    const t = branchSyncState[g]?.lastSyncedAt;
    return t && (!latest || t > latest) ? t : latest;
  }, null);

  // The manual "Sync now" button — every branch at once, one combined
  // toast rather than one per branch (see runSyncCycle's own comment).
  async function syncNow() {
    const results = await Promise.all(syncGymIds.map((gid) => runSyncCycle(gid)));
    const allOk = results.every((r) => r.ok);
    // The packaged desktop app has no menu and no DevTools, so a
    // console.error is invisible to the person actually holding the
    // problem. The reason has to travel to the toast or it may as well not
    // exist — "permission-denied" turns an unanswerable "why?" into a
    // one-line diagnosis.
    const reasons = [...new Set(results.flatMap((r) => r.errors || []))];
    // "Some records were rejected" rather than a flat "sync failed": the
    // distinction matters to whoever is standing at the desk. A rejected
    // record is still safe on this device and will retry, but it is NOT
    // on the server yet and won't be visible to anyone else — which is
    // exactly the confusion this message exists to prevent.
    setSyncToast(
      allOk
        ? { type: "success", message: "Synced successfully", id: Date.now() }
        : {
            type: "error",
            message: reasons.length
              ? `Didn't sync (${reasons.join("; ")}) — still saved here, will retry`
              : "Some records didn't sync — still saved here, will retry",
            id: Date.now(),
          }
    );
  }

  const value = {
    status,
    user,
    account,
    gym,
    branches,
    role: account?.role ?? null,
    gymId: activeGymId,
    setActiveGym,
    signOut: signOutUser,
    isLocked,
    syncStatus,
    lastSyncedAt,
    pendingCount,
    syncNow,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
      <SyncToast toast={syncToast} onDismiss={() => setSyncToast(null)} />
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
