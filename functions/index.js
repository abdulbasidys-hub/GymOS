// Password resets.
//
// Why this has to live on a server at all: a browser can only ever change
// its OWN password. Nothing in the client SDK can set somebody else's, and
// there is no "forgot password" email anywhere in GymOS by design. So the
// only way an owner can rescue a receptionist who has forgotten theirs is
// for a trusted process to do it — that's this.
//
// What it does is deliberately small: put the account back on the same
// starter password every new account begins with, and flag it so the app
// forces them to choose a new one the moment they sign in. The person doing
// the reset never learns the password the user eventually picks.
//
// Who may reset whom is enforced HERE, not in the app. The app hides buttons;
// this decides. The rules are the same ones firestore.rules applies
// everywhere else:
//
//   - a super admin may reset anyone
//   - an owner may reset a RECEPTIONIST at one of their own gyms
//   - nobody else may reset anybody, and a suspended account may reset no one

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore } = require("firebase-admin/firestore");

initializeApp();

// Must match DEFAULT_PASSWORD in src/lib/helpers.js — the same starter
// password every account is created with, so "reset" and "new account" put
// a user in exactly the same place and there is only one thing to tell them.
const DEFAULT_PASSWORD = "Welcome123";

/** Every gym an account can act against — the same shape as the client's
 *  resolveGymIds() and firestore.rules' myGymIds(). */
function gymIdsOf(account) {
  if (Array.isArray(account.gym_ids) && account.gym_ids.length) return account.gym_ids;
  if (account.gym_id) return [account.gym_id];
  return [];
}

exports.resetUserPassword = onCall({ region: "us-central1" }, async (request) => {
  const callerUid = request.auth && request.auth.uid;
  if (!callerUid) {
    throw new HttpsError("unauthenticated", "Sign in first.");
  }

  const targetUid = request.data && request.data.uid;
  if (!targetUid || typeof targetUid !== "string") {
    throw new HttpsError("invalid-argument", "Which account should be reset?");
  }
  if (targetUid === callerUid) {
    // Not a security hole, just pointless and confusing: you would be
    // locking yourself out of your own session to set a password you
    // already know. Settings has a proper change-password form.
    throw new HttpsError("failed-precondition", "Use Settings to change your own password.");
  }

  const db = getFirestore();
  const [callerSnap, targetSnap] = await Promise.all([
    db.doc(`users/${callerUid}`).get(),
    db.doc(`users/${targetUid}`).get(),
  ]);

  if (!callerSnap.exists) throw new HttpsError("permission-denied", "No account found for you.");
  if (!targetSnap.exists) throw new HttpsError("not-found", "That account no longer exists.");

  const caller = callerSnap.data();
  const target = targetSnap.data();

  // A suspended account keeps none of its powers.
  if (caller.active === false) {
    throw new HttpsError("permission-denied", "Your account is suspended.");
  }

  const isSuperAdmin = caller.role === "superadmin";
  const isOwnerOfTarget =
    caller.role === "owner" &&
    target.role === "receptionist" &&
    gymIdsOf(caller).includes(target.gym_id);

  if (!isSuperAdmin && !isOwnerOfTarget) {
    throw new HttpsError("permission-denied", "You can't reset that account's password.");
  }

  await getAuth().updateUser(targetUid, { password: DEFAULT_PASSWORD });

  // The flag is what makes the reset safe to hand over in person: whoever
  // did the reset knows the starter password, so the account must not stay
  // on it. SetPasswordPage.jsx blocks the app until it's replaced.
  await db.doc(`users/${targetUid}`).update({
    must_change_password: true,
    password_reset_at: new Date(),
    password_reset_by: callerUid,
  });

  return { ok: true, username: target.username || null, tempPassword: DEFAULT_PASSWORD };
});
