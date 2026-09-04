// Licensing math — pure, no storage, no UI.
//
// Web phase (§11): the authoritative lock is simple — a gym is blocked if
// its `status` is "suspended" or `subscription.locked` is true. That check
// lives directly against the gym doc (see data/gyms.js + firestore.rules).
//
// The functions below are the forward-looking pieces of §11: the 24h grace
// window past expiry, and the forward-only clock the Electron phase will
// need once the desk can go offline. They're used today only for DISPLAY
// (e.g. "expires in 3 days", "in grace, locks tomorrow") in the admin and
// owner screens — not as the access gate itself.

import { startOfDay, toDate } from "../lib/helpers";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** True once `now` is past `expiryDate` by more than `graceHours`. */
export function isPastGrace(expiryDate, graceHours = 24, now = new Date()) {
  const expiry = toDate(expiryDate);
  if (!expiry) return false;
  return now.getTime() > expiry.getTime() + graceHours * HOUR_MS;
}

/** True when `now` is past `expiryDate` but still inside the grace window. */
export function isInGrace(expiryDate, graceHours = 24, now = new Date()) {
  const expiry = toDate(expiryDate);
  if (!expiry) return false;
  return now.getTime() > expiry.getTime() && !isPastGrace(expiryDate, graceHours, now);
}

/**
 * Calendar days between `now` and `expiryDate` — negative once past expiry.
 * Compares calendar days (not raw elapsed hours) so the count doesn't drift
 * with what time of day it's checked. Display-only (e.g. "3 days remaining"
 * / "2 days past expiry").
 */
export function daysRemaining(expiryDate, now = new Date()) {
  const expiry = toDate(expiryDate);
  if (!expiry) return null;
  return Math.round((startOfDay(expiry).getTime() - startOfDay(now).getTime()) / DAY_MS);
}

/**
 * Combine a gym's stored fields into one status for display:
 * "locked" (instant-locked or suspended), "expired" (past grace),
 * "grace" (past expiry, still in grace), or "active".
 */
export function licenseStatus(gym, now = new Date()) {
  if (!gym) return "locked";
  if (gym.status === "suspended" || gym.subscription?.locked) return "locked";
  const expiry = gym.subscription?.expiry_date;
  const grace = gym.subscription?.grace_hours ?? 24;
  if (!expiry) return "active";
  if (isPastGrace(expiry, grace, now)) return "expired";
  if (isInGrace(expiry, grace, now)) return "grace";
  return "active";
}

/**
 * Forward-only clock: a rolled-back system clock must never look like time
 * moved backward. Feed it the last time seen and the current reading; it
 * returns whichever is later. (Electron-phase building block — the web
 * phase always trusts server time, so this isn't wired into enforcement
 * yet.)
 */
export function advanceClock(lastSeenAt, now = new Date()) {
  if (!lastSeenAt) return now;
  const last = lastSeenAt instanceof Date ? lastSeenAt : new Date(lastSeenAt);
  return now.getTime() > last.getTime() ? now : last;
}
