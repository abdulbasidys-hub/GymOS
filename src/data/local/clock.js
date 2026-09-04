// Phase 4 (BUILD.md §13's "Option A") — offline license enforcement's
// forward-only clock. Web already trusts server time (firestore.rules
// enforces the operational gate live); nothing does that offline once
// data is local, so Electron self-enforces using a clock that can't be
// walked backward by resetting the OS clock.

import { localInvoke } from "./bridge";

/** Returns the current "safe" time to evaluate a gym's license against.
 *  Outside Electron, just the raw wall clock (web keeps trusting server
 *  time as it always has). In Electron, persists the highest time ever
 *  observed (electron/local-db/syncMeta.cjs's advanceForwardClock) and
 *  returns THAT instead of the raw reading — a rolled-back system clock
 *  can only ever produce an equal-or-later result from this call, never
 *  an earlier one. */
export async function advanceForwardClock(gymId) {
  if (!window.gymOS?.isElectron || !gymId) return new Date();
  try {
    const { now } = await localInvoke("advanceForwardClock", { gymId, now: new Date().toISOString() });
    return new Date(now);
  } catch {
    return new Date();
  }
}
