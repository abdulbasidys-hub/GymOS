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

/**
 * Sign in with a USERNAME + password. Always tries the real Firebase
 * sign-in first — needed both to confirm the password is still current
 * and, critically, to establish a real Firestore-authorized session:
 * `firestore.rules` rejects unauthenticated requests, so a session
 * established purely offline (below) can queue local writes exactly like
 * any offline-created record already does, but can't actually reach
 * Firestore until a FUTURE online sign-in re-establishes a real session.
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
