// The `platform_plans` collection: super-admin-managed pricing tiers for
// what GYMS pay the PLATFORM for their software subscription (e.g. "Monthly
// — ₦10,000 / 30 days"). Distinct from `plans` (a gym's own membership/
// equipment plans sold to ITS members). Mutable — admin edits price/duration
// or retires a tier — but never hard-deleted, so history (platform_payments)
// keeps making sense after a price change.
//
// One plan, two audiences — deliberately not two separate models:
// SubscriptionModal.jsx picks one of these to extend a gym's subscription
// (the billing side), and the public marketing site's Pricing page
// (src/features/website/Pricing.jsx) renders these same `active` plans
// as its pricing cards (the sales side). A prospect sees a tier on the
// website before they ever sign up; the super admin then assigns their gym
// to that exact same tier at registration — so the two could never be
// allowed to drift into different objects. `max_members`/
// `max_receptionists`/`max_branches` (null = unlimited) are shown on both
// sides too: informational only for now (no enforcement in
// members.js/users.js/gyms.js) — see BUILD.md.

import {
  collection,
  doc,
  setDoc,
  updateDoc,
  getDocs,
  query,
  serverTimestamp,
} from "firebase/firestore";
import { db, auth } from "./firebase";
import { stripUndefined } from "../lib/helpers";

/** Create a platform pricing tier — operational (amount/duration/capacity) and marketing fields together. */
export async function createPlatformPlan({
  name,
  amount,
  durationDays,
  maxMembers,
  maxReceptionists,
  maxBranches,
  blurb,
  cta,
  featured,
  featuresIntro,
  features,
}) {
  const ref = doc(collection(db, "platform_plans"));
  const plan = stripUndefined({
    id: ref.id,
    name: String(name).trim(),
    amount: Number(amount),
    duration_days: Number(durationDays),
    max_members: maxMembers != null && maxMembers !== "" ? Number(maxMembers) : null,
    max_receptionists: maxReceptionists != null && maxReceptionists !== "" ? Number(maxReceptionists) : null,
    max_branches: maxBranches != null && maxBranches !== "" ? Number(maxBranches) : null,
    blurb: blurb?.trim() || "",
    cta: cta?.trim() || "Get started",
    featured: !!featured,
    features_intro: featuresIntro?.trim() || "",
    features: features ?? [],
    active: true,
    created_at: serverTimestamp(),
    actor_uid: auth.currentUser?.uid ?? null,
  });
  await setDoc(ref, plan);
  return plan;
}

/** List every platform pricing tier. */
export async function listPlatformPlans() {
  const snap = await getDocs(query(collection(db, "platform_plans")));
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => a.amount - b.amount);
}

/** Update a plan's editable fields — operational and marketing together (same object, see file header). */
export function updatePlatformPlan(planId, {
  name,
  amount,
  durationDays,
  maxMembers,
  maxReceptionists,
  maxBranches,
  blurb,
  cta,
  featured,
  featuresIntro,
  features,
}) {
  return updateDoc(
    doc(db, "platform_plans", planId),
    stripUndefined({
      name: name?.trim(),
      amount: amount != null ? Number(amount) : undefined,
      duration_days: durationDays != null ? Number(durationDays) : undefined,
      max_members: maxMembers !== undefined ? (maxMembers === "" || maxMembers == null ? null : Number(maxMembers)) : undefined,
      max_receptionists: maxReceptionists !== undefined ? (maxReceptionists === "" || maxReceptionists == null ? null : Number(maxReceptionists)) : undefined,
      max_branches: maxBranches !== undefined ? (maxBranches === "" || maxBranches == null ? null : Number(maxBranches)) : undefined,
      blurb: blurb !== undefined ? blurb.trim() : undefined,
      cta: cta !== undefined ? cta.trim() : undefined,
      featured: featured !== undefined ? !!featured : undefined,
      features_intro: featuresIntro !== undefined ? featuresIntro.trim() : undefined,
      features: features !== undefined ? features : undefined,
    })
  );
}

/** Retire a plan — hides it from new sales, keeps it for history. */
export function retirePlatformPlan(planId) {
  return updateDoc(doc(db, "platform_plans", planId), { active: false });
}

/** Reactivate a retired plan. */
export function reactivatePlatformPlan(planId) {
  return updateDoc(doc(db, "platform_plans", planId), { active: true });
}
