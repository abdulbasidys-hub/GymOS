// Auth session + the `users` collection.
//
// Kept inside src/data/ so the rest of the app never imports Firebase Auth
// directly. Signing in and reading a user's role/gym both live here.

import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  updatePassword,
  EmailAuthProvider,
  reauthenticateWithCredential,
} from "firebase/auth";
import { doc, getDoc, updateDoc, onSnapshot } from "firebase/firestore";
import { auth, db } from "./firebase";
import { usernameToEmail } from "../lib/helpers";
import { localInvoke } from "./local/bridge";

/**
 * Subscribe to sign-in / sign-out. Returns an unsubscribe function.
 *
 * Electron path (BUILD.md §15, offline authentication): watches
 * `local_session` instead of Firebase's own `onAuthStateChanged` — this
 * is now Electron's actual source of truth for "is anyone signed in,"
 * not just a convenience. Firebase Auth's own session can go stale or
 * momentarily unavailable on a network blip without that meaning the
 * user should be bounced back to a sign-in screen (offline sign-in/out
 * has to keep working regardless of what Firebase's client SDK thinks).
 * The callback gets a minimal `{ uid, username }` shape, not a real
 * Firebase `User` — the only field anything downstream reads off it is
 * `.uid` (to resolve the full account via `watchUserRecord`).
 */
export function watchAuth(callback) {
  if (window.gymOS?.isElectron) {
    return window.gymOS.db.onLocalSessionChange((session) => {
      callback(session ? { uid: session.uid, username: session.username } : null);
    });
  }
  return onAuthStateChanged(auth, callback);
}

// Credentials for an offline-authenticated session, held in memory ONLY so
// the session can be upgraded to a real Firebase one the moment the network
// comes back (ensureOnlineSession below).
//
// Why this has to exist: firestore.rules rejects unauthenticated requests,
// and an offline sign-in never touches Firebase Auth, so request.auth is
// null server-side. Without an upgrade path that state is a ONE-WAY DOOR —
// the desk signs in during an outage, works all day, reconnects, and every
// single push is still denied because there is no session. Sync appears to
// run and silently achieves nothing until someone thinks to sign out and
// back in, which nobody would know to do.
//
// Why the plaintext password: Firebase needs it to mint a session, and it
// is unrecoverable from anything on disk — local_credentials stores only a
// scrypt hash and salt, deliberately. Never written anywhere, never leaves
// this process, and cleared on sign-out. It lives no longer than the
// session it belongs to.
let offlineSessionCredentials = null;

/**
 * Makes sure there is a real Firebase session before anything tries to
 * reach Firestore. Returns true if one exists (or was just established).
 *
 * Three cases: already signed in — nothing to do; signed in offline and
 * still offline — the upgrade fails on a network error and the caller
 * skips its cycle; signed in offline and now online — a real sign-in
 * happens transparently, and the desk never sees a thing.
 *
 * Re-capturing the credential on success is not incidental: it refreshes
 * last_online_at, which is what the 14-day offline window is measured
 * from. A device that keeps reconnecting keeps earning its offline access.
 */
export async function ensureOnlineSession() {
  // `auth.currentUser` is a LOCAL CACHE and it lies. Firebase restores it
  // from storage at startup without contacting the server, so it is
  // non-null even when the refresh token behind it has been revoked or
  // invalidated (a password changed on another device, a session revoked,
  // a deleted account). In that state every Firestore call is denied while
  // the client cheerfully reports someone is signed in — which looked
  // exactly like a rules bug: a 400 from the token endpoint, then a wall
  // of permission-denied across every read and write.
  //
  // Forcing a refresh is the only way to ask the SERVER whether this
  // session is still real.
  if (auth.currentUser) {
    try {
      await auth.currentUser.getIdToken(true);
      return { ok: true };
    } catch (err) {
      // Offline: the token can't be checked, but the cached session is the
      // best evidence available and may well still be valid. Don't destroy
      // it — just skip this cycle.
      if (err?.code === "auth/network-request-failed") {
        return { ok: false, reason: "offline" };
      }
      // Online and the server refused it. The session is genuinely dead;
      // clearing it is what lets the offline credentials below (or, failing
      // that, a fresh sign-in) take over instead of retrying a corpse.
      console.error("Firebase session is no longer valid:", err?.code || err);
      await signOut(auth).catch(() => {});
    }
  }

  if (!window.gymOS?.isElectron || !offlineSessionCredentials) {
    return { ok: false, reason: auth.currentUser ? "offline" : "signed-out" };
  }

  const { username, password } = offlineSessionCredentials;
  try {
    const cred = await signInWithEmailAndPassword(auth, usernameToEmail(username), password);
    const snap = await getDoc(doc(db, "users", cred.user.uid)).catch(() => null);
    const gymId = snap?.exists() ? snap.data().gym_id ?? null : null;
    await localInvoke("captureCredential", { uid: cred.user.uid, username, gymId, password }).catch(() => {});
    offlineSessionCredentials = null;
    return { ok: true };
  } catch (err) {
    // Still offline: keep the credentials and try again next cycle.
    if (err?.code === "auth/network-request-failed") {
      return { ok: false, reason: "offline" };
    }
    // Anything else (the password was changed centrally, the account was
    // disabled) means these credentials will never work — drop them rather
    // than retrying a rejected password every cycle, which is how accounts
    // get locked out for repeated failed attempts.
    console.error("Couldn't upgrade the offline session to an online one:", err?.code || err);
    offlineSessionCredentials = null;
    return { ok: false, reason: "rejected" };
  }
}

/**
 * A FRESH Firebase sign-in performed immediately before a manual sync, so
 * the session doing the writing is provably live rather than a cached one
 * that may already be revoked.
 *
 * This exists because auth.currentUser is only a local cache: Firebase
 * restores it from storage without asking the server, so it can look
 * signed-in while every request is denied. Rather than detect that after
 * the fact, a manual sync just re-establishes the session from the
 * password each time — the password is the one thing that always produces
 * a genuinely current token.
 *
 * Also re-captures the offline credential, which refreshes last_online_at
 * and so renews the 14-day offline sign-in window on every successful sync.
 */
/** Is there a REAL Firebase session right now — i.e. did this person sign
 *  in online, rather than against the local credential store? True only
 *  after a genuine Firebase sign-in, which is exactly the moment a sync can
 *  run without asking for a password again. */
export function hasFirebaseSession() {
  return !!auth.currentUser;
}

export async function reauthenticateForSync(username, password) {
  const cred = await signInWithEmailAndPassword(auth, usernameToEmail(username), password);
  if (window.gymOS?.isElectron) {
    const snap = await getDoc(doc(db, "users", cred.user.uid)).catch(() => null);
    const gymId = snap?.exists() ? snap.data().gym_id ?? null : null;
    await localInvoke("captureCredential", { uid: cred.user.uid, username, gymId, password }).catch(() => {});
    await localInvoke("setLocalSession", { uid: cred.user.uid, username, gymId }).catch(() => {});
  }
  offlineSessionCredentials = null;
  return cred;
}

/**
 * Sign in with a USERNAME + password. Always tries the real Firebase
 * sign-in first — needed both to confirm the password is still current
 * and to establish a real Firestore-authorized session, since
 * `firestore.rules` rejects unauthenticated requests.
 *
 * Electron offline fallback (BUILD.md §15): a network failure here falls
 * back to `verifyCredential` — a locally scrypt-hashed password check
 * that only ever succeeds for someone who has personally signed in
 * online on THIS device before (the one moment a plaintext password is
 * ever seen, captured below purely to make this possible), and only
 * within 14 days of their last online sign-in here. Firebase never
 * exposes password hashes to any client, so there is no way to
 * pre-authorize a gym's whole staff from just one person's login — each
 * person's own offline access activates the first time THEY personally
 * sign in online on this device.
 *
 * An offline sign-in used to be a dead end for syncing: no Firebase
 * session meant every push was denied for the rest of that session, even
 * after the connection came back. It now hands its credentials to
 * ensureOnlineSession above, which upgrades the session in the background
 * the moment Firebase is reachable.
 */
export async function signInWithUsername(username, password) {
  try {
    const cred = await signInWithEmailAndPassword(auth, usernameToEmail(username), password);
    if (window.gymOS?.isElectron) {
      // Read straight from Firestore, not the (possibly still-empty, on a
      // brand new device) local `users` table — we're definitely online
      // right here, so this is the one reliable place to learn gym_id
      // before ensureBootstrapped (auth.jsx) has necessarily run yet.
      const snap = await getDoc(doc(db, "users", cred.user.uid)).catch(() => null);
      const gymId = snap?.exists() ? snap.data().gym_id ?? null : null;
      // Best-effort: losing offline-login capability for this ONE sign-in
      // (captured again next time) must never turn an already-successful
      // Firebase sign-in into a reported failure.
      await localInvoke("captureCredential", { uid: cred.user.uid, username, gymId, password }).catch((err) => {
        console.error("Failed to capture offline credential (offline sign-in unavailable for this account until the next successful online sign-in):", err);
      });
      // NOT best-effort — this is what actually makes Electron's UI
      // recognize the sign-in (watchAuth watches local_session there).
      await localInvoke("setLocalSession", { uid: cred.user.uid, username, gymId });
    }
    offlineSessionCredentials = null;
    return cred;
  } catch (err) {
    // Deliberately narrow — ONLY Firebase's own definitive "the request
    // never reached the server" signal falls back to local verification.
    // `!navigator.onLine` was considered and rejected: that flag can be
    // stale/wrong in ways that would let it misfire on a GENUINE wrong-
    // password rejection from Firebase (a real, confirmed answer, not a
    // network failure), silently trying local verification instead of
    // just reporting "incorrect password." A real network problem still
    // reaches here every time — Firebase throws this exact code for that.
    const isNetworkError = err?.code === "auth/network-request-failed";
    if (window.gymOS?.isElectron && isNetworkError) {
      const result = await localInvoke("verifyCredential", { username, password });
      if (result.ok) {
        await localInvoke("setLocalSession", { uid: result.uid, username: result.username, gymId: result.gymId });
        // Held so ensureOnlineSession can turn this into a real Firebase
        // session as soon as the connection returns — without it this
        // sign-in could never reach Firestore again, no matter how long
        // the machine stayed online afterwards.
        offlineSessionCredentials = { username, password };
        return result;
      }
      const code =
        result.reason === "expired" ? "local/offline-credential-expired"
        : result.reason === "not_found" ? "local/offline-credential-missing"
        : "auth/wrong-password"; // a real local password mismatch — same message as Firebase's own
      const localErr = new Error(code);
      localErr.code = code;
      throw localErr;
    }
    throw err;
  }
}

/** Sign the current user out. Electron: clears `local_session` first (the
 *  authoritative "signed in" state there) — best-effort on Firebase's own
 *  signOut() too, since a purely offline-authenticated session never had
 *  a real Firebase session to begin with. */
export async function signOutUser() {
  // Before anything else: these must not outlive the session, and must not
  // be left behind for whoever signs in next on a shared desk machine.
  offlineSessionCredentials = null;
  if (window.gymOS?.isElectron) {
    await localInvoke("clearLocalSession", {});
  }
  return signOut(auth).catch(() => {});
}

/**
 * Load a user's account record (role + gym). Returns null if none exists.
 * Shape: { id, role, name, gym_id? }  — gym_id is absent for super-admins.
 * One-shot — for looking up someone ELSE's record (e.g. resolving a
 * receptionist's name on an owner's expandable row).
 */
export async function getUserRecord(uid) {
  if (window.gymOS?.isElectron) return localInvoke("getUserRecord", { uid });
  const snap = await getDoc(doc(db, "users", uid));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

/**
 * Subscribe to YOUR OWN account record, live. Used by AuthProvider so that a
 * change made to your own doc (e.g. clearing must_change_password after
 * SetPasswordPage, or an owner deactivating you mid-session) is reflected
 * immediately, without needing a fresh sign-in. Returns an unsubscribe fn.
 *
 * Electron path (BUILD.md §15): a device that's never signed in before has
 * an empty local `users` table, so a plain local watch would fire null
 * forever — and since ensureBootstrapped (auth.jsx) only ever runs once a
 * real account is known, that's a permanent deadlock, not a temporary
 * empty state. Confirmed real bug, fixed here: when the local lookup comes
 * back empty, fall back to one direct Firestore read (same bypass-the-
 * branch pattern bootstrap.js already uses) so gym_id resolves and
 * bootstrap can actually run. The local live watcher is still attached
 * either way, for ongoing updates once local data exists — its own
 * immediate re-fire-on-subscribe is harmless even if still empty at that
 * instant: a null from it is only ever forwarded before a real record has
 * been seen, never after (a stale/racy null once we already know the real
 * account can't be a legitimate transition — nothing locally-writable ever
 * deletes a user row).
 */
export function watchUserRecord(uid, callback) {
  if (window.gymOS?.isElectron) {
    let unsubscribed = false;
    let localUnsub = null;
    let haveRealRecord = false;

    function emit(record) {
      if (unsubscribed) return;
      if (record) haveRealRecord = true;
      else if (haveRealRecord) return;
      callback(record);
    }

    (async () => {
      const localRecord = await localInvoke("getUserRecord", { uid });
      if (unsubscribed) return;

      if (!localRecord) {
        try {
          const snap = await getDoc(doc(db, "users", uid));
          if (unsubscribed) return;
          emit(snap.exists() ? { id: snap.id, ...snap.data() } : null);
        } catch {
          if (!unsubscribed) emit(null);
        }
      }

      if (unsubscribed) return;
      localUnsub = window.gymOS.db.onUserRecordChange(uid, emit);
    })();

    return () => {
      unsubscribed = true;
      if (localUnsub) localUnsub();
    };
  }
  return onSnapshot(
    doc(db, "users", uid),
    (snap) => callback(snap.exists() ? { id: snap.id, ...snap.data() } : null),
    () => callback(null) // rules denied, or any other error — no usable account
  );
}

/**
 * Set your OWN password (used once, right after signing in on the temporary
 * password an owner/super-admin generated for you) and clear the
 * must_change_password flag that got you here.
 *
 * Confirmed real bug, fixed here (BUILD.md §15): this always wrote the
 * cleared flag to Firestore only. On the web that's enough — the live
 * `onSnapshot` in watchUserRecord picks it up immediately. In Electron,
 * `watchUserRecord` reads from LOCAL SQLite once signed in, and nothing
 * was mirroring this specific write down into it — so the local row's
 * `must_change_password` stayed `true` forever, and SetPasswordPage kept
 * reappearing indefinitely even though the password change itself (and
 * the Firestore write) had actually succeeded.
 */
export async function changeOwnPassword(newPassword) {
  const user = auth.currentUser;
  if (!user) throw new Error("Not signed in");
  await updatePassword(user, newPassword);
  await updateDoc(doc(db, "users", user.uid), { must_change_password: false });
  if (window.gymOS?.isElectron) {
    await localInvoke("clearMustChangePassword", { uid: user.uid });
  }
}

/**
 * Change your OWN password from Settings, anytime after that first sign-in
 * (see changeOwnPassword above for the one-time forced flow). Firebase
 * requires a RECENT sign-in for a sensitive op like this, and by the time
 * someone opens Settings their session could be old — so this re-authenticates
 * with their current password first, rather than surfacing a cryptic
 * "requires-recent-login" error.
 */
export async function changePassword(currentPassword, newPassword) {
  const user = auth.currentUser;
  if (!user) throw new Error("Not signed in");
  const credential = EmailAuthProvider.credential(user.email, currentPassword);
  await reauthenticateWithCredential(user, credential);
  await updatePassword(user, newPassword);
}
