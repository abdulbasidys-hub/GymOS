// Pooled per-owner subscriptions (BUILD.md §6/§13). users/{ownerUid}.subscription
// is the SOURCE OF TRUTH — one price, one expiry, one lock state covers every
// gym an owner manages. The exact same map is mirrored, in one atomic batch,
// onto every gyms/{id}.subscription the owner manages, as a denormalized read
// CACHE — that's deliberate, not incidental: firestore.rules' gymIsOperational(),
// logic/license.js, GymDetailPage.jsx's status block, and the Electron pull
// pipeline (fetchGym -> local gyms table's subscription_* columns) all already
// read gyms/{id}.subscription and need ZERO changes because of this — the
// alternative (every one of those hopping owner->gym on every check) would
// touch the app's most safety-critical code path for no benefit.
//
// Supersedes gyms.js's old per-gym setSubscription/lockSubscription/
// unlockSubscription — a gym never has its own independent subscription
// anymore, only ever a cached copy of its owner's.

import { doc, writeBatch, serverTimestamp } from "firebase/firestore";
import { db } from "./firebase";
import { stripUndefined } from "../lib/helpers";

function fanOut(ownerUid, gymIds, subscriptionPatch) {
  const batch = writeBatch(db);
  const ownerDotted = {};
  const gymDotted = {};
  for (const [k, v] of Object.entries(subscriptionPatch)) {
    ownerDotted[`subscription.${k}`] = v;
    gymDotted[`subscription.${k}`] = v;
  }
  batch.update(doc(db, "users", ownerUid), ownerDotted);
  for (const gymId of gymIds) {
    batch.update(doc(db, "gyms", gymId), gymDotted);
  }
  return batch;
}

/**
 * Set or extend an owner's pooled subscription, covering every gym in
 * `gymIds`. `expiryDate` is a JS Date; `graceHours` defaults to the
 * platform standard (24h). `planId`/`planName` are recorded when this
 * extension came from a platform pricing plan (SubscriptionModal.jsx) —
 * omitted for a manual/custom-date extension. Dot-notation, same reasoning
 * as the old per-gym setSubscription: a custom-date extension (no plan)
 * leaves the last-known plan_id/plan_name in place instead of wiping them.
 */
export async function setOwnerSubscription(ownerUid, gymIds, { expiryDate, graceHours = 24, planId, planName }) {
  const patch = stripUndefined({
    activated_at: serverTimestamp(),
    expiry_date: expiryDate,
    grace_hours: graceHours,
    last_verified_at: serverTimestamp(),
    locked: false,
    plan_id: planId,
    plan_name: planName,
  });
  await fanOut(ownerUid, gymIds, patch).commit();
}

/** Instantly lock an owner's subscription (and every branch's cache), independent of expiry date. */
export async function lockOwnerSubscription(ownerUid, gymIds) {
  await fanOut(ownerUid, gymIds, { locked: true, last_verified_at: serverTimestamp() }).commit();
}

/** Unlock an owner's subscription (and every branch's cache) — does not change its expiry date. */
export async function unlockOwnerSubscription(ownerUid, gymIds) {
  await fanOut(ownerUid, gymIds, { locked: false, last_verified_at: serverTimestamp() }).commit();
}
