// The check-in verdict. Pure — no storage, no UI.
//
// Equipment has THREE states, not two, and the middle one is the whole
// reason this file is more than an &&:
//
//   active   — paid for, clock running, in date
//   pending  — paid for, clock not started yet. It starts at their NEXT
//              check-in, so they get the full period they paid for instead
//              of losing the tail of the day they bought it
//   expired  — had it and it ran out, or never bought it at all
//
// Entry is allowed on active OR pending, and refused on expired. Pending has
// to be allowed or the rule eats itself: a member pays for equipment, and the
// very check-in that is supposed to START that equipment would be the one
// blocked.
//
// This used to read `allowed = membership && equipmentActive`, which got
// pending wrong in one direction and the attendance button wrong in the
// other — the banner said "Entry blocked" for somebody who had just paid,
// while the Record attendance button stayed enabled for somebody whose
// equipment had genuinely expired. The button and the banner now come from
// this one function, so they cannot disagree again.

export function verdict({ membershipActive, equipmentActive, equipmentPending }) {
  const membership = !!membershipActive;
  const equipment = !!equipmentActive;
  const pending = !!equipmentPending;
  // Paid-for equipment that has not started counting. An expired record with
  // a newer unstarted payment against it is pending, not expired — the
  // payment is the fact that matters.
  const equipmentOk = equipment || pending;
  return {
    membershipActive: membership,
    equipmentActive: equipment,
    equipmentPending: pending,
    equipmentOk,
    allowed: membership && equipmentOk,
  };
}

/** Why entry is refused, in the order a receptionist should act on it.
 *  Null when entry is allowed. Kept next to the rule so the wording can
 *  never drift from the condition that produced it. */
export function blockedReason(v) {
  if (v.allowed) return null;
  if (!v.membershipActive && !v.equipmentOk) return "both";
  if (!v.membershipActive) return "membership";
  return "equipment";
}
