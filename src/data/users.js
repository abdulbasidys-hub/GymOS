// The `users` collection: account records (role + gym) plus account creation.
//
// Creating a Firebase Auth user with the client SDK signs the browser in AS
// that new user — unacceptable when a super-admin creates an owner, or an
// owner creates a receptionist, without losing their own session. The fix is
// a SECONDARY Firebase app instance: it gets its own isolated Auth state, so
// signing IT out never touches the primary session. (See BUILD.md §7 — a
// Cloud Function with the Admin SDK is the cleaner long-term fix, deferred to
// the server/ phase.)

import { initializeApp, deleteApp } from "firebase/app";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signOut as secondarySignOut,
} from "firebase/auth";
import {
  collection,
  doc,
  setDoc,
  updateDoc,
  getDocs,
  query,
  where,
  writeBatch,
  arrayUnion,
  serverTimestamp,
} from "firebase/firestore";
import app, { db, auth } from "./firebase";
import { stripUndefined, usernameToEmail, DEFAULT_PASSWORD } from "../lib/helpers";
import { localInvoke } from "./local/bridge";

// Firebase config lives on the primary `app`; re-derive it for the secondary
// instance rather than importing .env again here.
const firebaseConfig = app.options;

/**
 * Create a Firebase Auth user + matching `users/{uid}` doc, WITHOUT signing
 * the current (primary) session out. Returns the created account record.
 * Every new account starts on the same DEFAULT_PASSWORD — whoever creates it
 * never chooses/sees a unique credential for someone else — and
 * must_change_password forces it to be replaced before first real use
 * (SetPasswordPage.jsx).
 */
async function createAccount({ username, role, name, gymId, gymIds, phone, address, email }) {
  const secondaryName = `secondary-${Date.now()}`;
  const secondaryApp = initializeApp(firebaseConfig, secondaryName);
  const secondaryAuth = getAuth(secondaryApp);

  try {
    const cred = await createUserWithEmailAndPassword(
      secondaryAuth,
      usernameToEmail(username),
      DEFAULT_PASSWORD
    );

    const record = stripUndefined({
      id: cred.user.uid,
      role,
      name: String(name).trim(),
      username: String(username).trim().toLowerCase(),
      gym_id: gymId,
      // Owners only (BUILD.md §6) — every branch this owner manages,
      // primary gym first. gym_id stays the permanent "primary" branch;
      // this is what lets one login manage more than one gym (see
      // addBranchToOwner below for how a Nth branch gets appended).
      gym_ids: gymIds,
      phone: phone ? String(phone).trim() : undefined,
      address: address ? String(address).trim() : undefined,
      // Their real contact address — distinct from usernameToEmail(username)
      // above, which is only a synthetic login for Firebase Auth. Captured
      // now for a future notification feature, not read anywhere yet.
      email: email ? String(email).trim() : undefined,
      active: true,
      must_change_password: true,
      created_at: serverTimestamp(),
      actor_uid: auth.currentUser?.uid ?? null,
    });

    // Written from the PRIMARY session (the creator), not the secondary one —
    // the secondary user has no Firestore permissions of its own yet.
    await setDoc(doc(db, "users", cred.user.uid), record);

    return { ...record, tempPassword: DEFAULT_PASSWORD };
  } finally {
    await secondarySignOut(secondaryAuth).catch(() => {});
    await deleteApp(secondaryApp).catch(() => {});
  }
}

/**
 * Create an owner account and assign them to their first (primary) gym.
 * Username is global. `gym_ids` starts as just this one gym — see
 * addBranchToOwner for how the super admin attaches more later.
 */
export function createOwner({ username, name, gymId, phone, email }) {
  return createAccount({ username, name, gymId, gymIds: [gymId], phone, email, role: "owner" });
}

/**
 * Create a receptionist account in the given gym. `username` should already
 * carry the gym's prefix (e.g. "itf-reception1") — screens are responsible
 * for building that so collisions across gyms stay impossible.
 */
export function createReceptionist({ username, name, gymId, phone, address, email }) {
  return createAccount({ username, name, gymId, phone, address, email, role: "receptionist" });
}

/**
 * Create an affiliate marketer account. Not scoped to any one gym (gymId is
 * omitted) — an affiliate can be attached to many gyms (gyms.js's
 * createGym), tracked via each gym's own affiliate_id field.
 */
export function createAffiliate({ username, name, phone, email }) {
  return createAccount({ username, name, phone, email, role: "affiliate" });
}

/** List every owner (super-admin view). */
export async function listOwners() {
  const snap = await getDocs(
    query(collection(db, "users"), where("role", "==", "owner"))
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * The one owner managing a gym (super-admin gym detail view) — matches on
 * `gym_ids` (array-contains) rather than the legacy scalar `gym_id`, so a
 * branch attached to an owner via addBranchToOwner is found too, not just
 * their primary gym. Scoped by both fields rather than filtering
 * listOwners() client-side, so this stays cheap regardless of how many
 * gyms/owners exist platform-wide.
 */
export async function getOwnerForGym(gymId) {
  const snap = await getDocs(
    query(
      collection(db, "users"),
      where("gym_ids", "array-contains", gymId),
      where("role", "==", "owner")
    )
  );
  const d = snap.docs[0];
  return d ? { id: d.id, ...d.data() } : null;
}

/**
 * Attach an existing gym to an existing owner's account — the multi-branch
 * equivalent of createOwner, for a super admin adding a Nth branch
 * (NewGym.jsx's "existing owner" flow) instead of creating a fresh login.
 * Also copies the owner's CURRENT pooled subscription onto the new gym's
 * own cache (gyms/{id}.subscription — see data/subscriptions.js's own
 * header for why that field is a cache, not a second source of truth), so
 * a branch added to an already-locked/expired account starts locked, not
 * with a free grace period. Both writes are one atomic batch.
 */
export async function addBranchToOwner(owner, gymId) {
  const batch = writeBatch(db);
  batch.update(doc(db, "users", owner.id), { gym_ids: arrayUnion(gymId) });
  const dotted = {};
  for (const [k, v] of Object.entries(owner.subscription ?? {})) {
    dotted[`subscription.${k}`] = v;
  }
  if (Object.keys(dotted).length > 0) batch.update(doc(db, "gyms", gymId), dotted);
  await batch.commit();
}

/** List a gym's receptionists. */
export async function listStaff(gymId) {
  if (window.gymOS?.isElectron) return localInvoke("listStaff", { gymId });
  const snap = await getDocs(
    query(
      collection(db, "users"),
      where("gym_id", "==", gymId),
      where("role", "==", "receptionist")
    )
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) =>
    a.name.localeCompare(b.name)
  );
}

/** Activate/deactivate an account (owner deactivating staff, admin an owner). */
export function setUserActive(uid, active) {
  if (window.gymOS?.isElectron) return localInvoke("setUserActive", { uid, active });
  return updateDoc(doc(db, "users", uid), { active });
}

/** Set/update a contact phone number on an owner or receptionist account. */
export function setUserPhone(uid, phone) {
  if (window.gymOS?.isElectron) return localInvoke("setUserPhone", { uid, phone: String(phone).trim() });
  return updateDoc(doc(db, "users", uid), { phone: String(phone).trim() });
}

/** Set/update a contact email on an owner, receptionist, or affiliate account. */
export function setUserEmail(uid, email) {
  if (window.gymOS?.isElectron) return localInvoke("setUserEmail", { uid, email: String(email).trim() });
  return updateDoc(doc(db, "users", uid), { email: String(email).trim() });
}

/** List every affiliate marketer (super-admin's Settings page). */
export async function listAffiliates() {
  const snap = await getDocs(
    query(collection(db, "users"), where("role", "==", "affiliate"))
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * An affiliate sets their OWN payout details — self-service, not something
 * super-admin fills in for them (AffiliateHome.jsx).
 */
export function setAffiliateBankDetails(uid, { bankName, accountNumber }) {
  return updateDoc(
    doc(db, "users", uid),
    stripUndefined({
      bank_name: bankName?.trim(),
      account_number: accountNumber?.trim(),
    })
  );
}
