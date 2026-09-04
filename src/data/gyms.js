// The `gyms` collection. Gyms are mutable entities (they can be renamed or
// suspended), so they don't go through the append-only ledger — that's for
// immutable facts like payments and attendance.

import {
  collection,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  getDocs,
  onSnapshot,
  query,
  where,
  orderBy,
  serverTimestamp,
} from "firebase/firestore";
import { db, auth } from "./firebase";
import { stripUndefined } from "../lib/helpers";
import { localInvoke } from "./local/bridge";

/**
 * Create a gym. Prefix is uppercased and must be unique across the platform
 * (it's what member numbers are built from, e.g. ITF-0001, and it's permanent).
 * Throws Error with code "prefix-taken" if the prefix already exists.
 * `affiliateId`/`affiliateName` are optional — set when this gym was brought
 * in by a registered affiliate marketer (NewGym.jsx), so a cut of its future
 * platform payments goes to them (see data/affiliateEarnings.js).
 * `countryCode`/`countryName`/`currencyCode` (from CountryPicker.jsx) are
 * PERMANENT, same reasoning as prefix — every member payment/plan price this
 * gym ever records is shown in this currency (lib/helpers.js's formatMoney),
 * so changing it later would make the gym's own historical revenue numbers
 * incoherent (mixing currencies in one "total collected" figure). Gyms
 * created before this field existed simply don't have it — formatMoney
 * treats that the same as NGN/Nigeria, matching how the app always behaved.
 */
export async function createGym({ name, prefix, address, affiliateId, affiliateName, countryCode, countryName, currencyCode }) {
  const cleanPrefix = String(prefix).trim().toUpperCase();

  // Uniqueness check (single-field equality — no composite index needed).
  const clash = await getDocs(
    query(collection(db, "gyms"), where("prefix", "==", cleanPrefix))
  );
  if (!clash.empty) {
    const err = new Error("prefix-taken");
    err.code = "prefix-taken";
    throw err;
  }

  const ref = doc(collection(db, "gyms"));
  const gym = stripUndefined({
    id: ref.id,
    name: String(name).trim(),
    prefix: cleanPrefix,
    address: address ? String(address).trim() : undefined,
    status: "active",   // active | suspended (licensing, later)
    member_seq: 0,      // running counter for member numbers, used at registration
    affiliate_id: affiliateId || undefined,
    affiliate_name: affiliateName || undefined,
    country_code: countryCode || undefined,
    country_name: countryName || undefined,
    currency_code: currencyCode || undefined,
    created_at: serverTimestamp(),
    actor_uid: auth.currentUser?.uid ?? null,
  });

  await setDoc(ref, gym);
  return gym;
}

/** List all gyms, alphabetically. (orderBy only — no composite index needed.) */
export async function listGyms() {
  const snap = await getDocs(query(collection(db, "gyms"), orderBy("name")));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/** Every gym a given affiliate marketer brought in (their own page's gym list). */
export async function listGymsByAffiliate(affiliateId) {
  const snap = await getDocs(query(collection(db, "gyms"), where("affiliate_id", "==", affiliateId)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/** Fetch a single gym by id. Returns null if it doesn't exist. */
export async function getGym(gymId) {
  if (window.gymOS?.isElectron) return localInvoke("getGym", { gymId });
  const snap = await getDoc(doc(db, "gyms", gymId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

/**
 * Subscribe to a gym's live doc — used to react instantly to a super-admin
 * suspending/locking a gym while someone is already signed in ("next online
 * contact" per BUILD.md §11, which for the web phase is just "right now").
 * Returns an unsubscribe function.
 */
export function watchGym(gymId, callback) {
  if (window.gymOS?.isElectron) return window.gymOS.db.onGymChange(gymId, callback);
  return onSnapshot(doc(db, "gyms", gymId), (snap) => {
    callback(snap.exists() ? { id: snap.id, ...snap.data() } : null);
  });
}

/** Rename a gym. The prefix is never editable — it's permanent (member numbers depend on it). */
export function updateGymName(gymId, name) {
  if (window.gymOS?.isElectron) return localInvoke("updateGymName", { gymId, name: String(name).trim() });
  return updateDoc(doc(db, "gyms", gymId), { name: String(name).trim() });
}

/** Suspend a gym — blocks all operational reads/writes (see firestore.rules). */
export function suspendGym(gymId) {
  return updateDoc(doc(db, "gyms", gymId), { status: "suspended" });
}

/** Reactivate a suspended gym. */
export function reactivateGym(gymId) {
  return updateDoc(doc(db, "gyms", gymId), { status: "active" });
}

// setSubscription/lockSubscription/unlockSubscription used to live here,
// writing directly to one gym's own subscription field. Superseded by
// data/subscriptions.js's setOwnerSubscription/lockOwnerSubscription/
// unlockOwnerSubscription (BUILD.md §6/§13) — a gym's subscription is now a
// cached mirror of its owner's pooled subscription, never set directly.
