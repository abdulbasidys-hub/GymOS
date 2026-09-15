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
    // Any real extension ends a free trial, whether it came from a plan or
    // a hand-picked date — this is the moment a trial becomes a customer.
    trial: false,
    plan_id: planId,
    plan_name: planName,
  });
  await fanOut(ownerUid, gymIds, patch).commit();
}

/**
 * Start a free trial for a brand-new owner — the promotional "try it before
 * you buy it" path (NewGym.jsx). Identical plumbing to setOwnerSubscription
 * above, with two differences that matter:
 *
 *   - `trial: true` marks it, so every screen can say "Free trial" instead
 *     of showing it as a bought subscription, and so the platform's revenue
 *     figures are never polluted — a trial deliberately records NO platform
 *     payment and NO affiliate commission, because no money changed hands.
 *   - the expiry is measured in whole MONTHS from today, by calendar, so a
 *     trial started on the 3rd ends on the 3rd.
 *
 * When the trial runs out the gym locks exactly like any other lapsed
 * subscription (logic/license.js doesn't care how the expiry got there),
 * and the super admin converts it to a paid plan from the normal
 * subscription screen, which clears the trial flag.
 */
export async function startFreeTrial(ownerUid, gymIds, months) {
  const expiryDate = new Date();
  expiryDate.setMonth(expiryDate.getMonth() + Number(months));
  expiryDate.setHours(23, 59, 59, 999);

  await fanOut(ownerUid, gymIds, {
    activated_at: serverTimestamp(),
    expiry_date: expiryDate,
    grace_hours: 24,
    last_verified_at: serverTimestamp(),
    locked: false,
    trial: true,
    plan_id: null,
    plan_name: `Free trial — ${months} month${Number(months) === 1 ? "" : "s"}`,
  }).commit();

  return expiryDate;
}

/** Instantly lock an owner's subscription (and every branch's cache), independent of expiry date. */
export async function lockOwnerSubscription(ownerUid, gymIds) {
  await fanOut(ownerUid, gymIds, { locked: true, last_verified_at: serverTimestamp() }).commit();
}

/** Unlock an owner's subscription (and every branch's cache) — does not change its expiry date. */
export async function unlockOwnerSubscription(ownerUid, gymIds) {
  await fanOut(ownerUid, gymIds, { locked: false, last_verified_at: serverTimestamp() }).commit();
}
