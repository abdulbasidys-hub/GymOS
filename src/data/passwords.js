// Resetting somebody ELSE'S password.
//
// There is no "forgot password" email anywhere in GymOS — no email is ever
// sent — so a forgotten password is rescued in person by whoever created the
// account: an owner for their receptionists, the super admin for owners.
//
// The real work happens in functions/index.js, because only a trusted
// server process may change another account's password, and that's also
// where the rules about WHO may reset WHOM are enforced. Everything here is
// just the call.

import { httpsCallable } from "firebase/functions";
import { functions } from "./firebase";
import { DEFAULT_PASSWORD } from "../lib/helpers";

export { DEFAULT_PASSWORD };

/**
 * Put an account back on the starter password and force them to choose a new
 * one at their next sign-in. Returns `{ username, tempPassword }` so the
 * caller can show exactly what to hand over.
 *
 * Throws with a human-readable `message` — the server sends one back for
 * every refusal, so screens can surface it directly rather than inventing
 * their own wording for cases they can't see (a suspended caller, a deleted
 * target, an owner reaching outside their own gyms).
 */
export async function resetUserPassword(uid) {
  try {
    const call = httpsCallable(functions, "resetUserPassword");
    const { data } = await call({ uid });
    return { username: data?.username ?? null, tempPassword: data?.tempPassword ?? DEFAULT_PASSWORD };
  } catch (err) {
    // A callable surfaces the server's own message on err.message; the
    // fallback covers a genuine network/deploy failure, where there is no
    // server message at all.
    const message =
      err?.message && !/internal/i.test(err.message)
        ? err.message
        : "Couldn't reset that password. Check your connection and try again.";
    const wrapped = new Error(message);
    wrapped.code = err?.code;
    throw wrapped;
  }
}
