// PREFIX-#### formatting. Pure — no storage, no UI.

/** Format a gym prefix + sequence number into e.g. "ITF-0001". */
export function formatMemberNumber(prefix, seq) {
  return `${prefix}-${String(seq).padStart(4, "0")}`;
}
