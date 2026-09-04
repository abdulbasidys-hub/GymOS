// The check-in verdict. Pure — no storage, no UI.
//
// Two independent clocks, BOTH must be green: allowed = membership AND
// equipment. Callers derive each flag with logic/expiry.js first.

export function verdict({ membershipActive, equipmentActive }) {
  const membership = !!membershipActive;
  const equipment = !!equipmentActive;
  return {
    membershipActive: membership,
    equipmentActive: equipment,
    allowed: membership && equipment,
  };
}
