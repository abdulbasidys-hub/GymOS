// Revenue math over frozen payment amounts. Pure — no storage, no UI.

import { toDate } from "../lib/helpers";

/** Sum the (frozen) `amount` field across a list of payments. */
export function sumAmounts(payments) {
  return (payments || []).reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
}

/** Filter payments to those paid within [start, end] (inclusive), by `paid_at`. */
export function filterByRange(payments, start, end) {
  const startMs = start ? new Date(start).getTime() : -Infinity;
  const endMs = end ? new Date(end).getTime() : Infinity;
  return (payments || []).filter((p) => {
    const at = toDate(p.paid_at)?.getTime();
    return at != null && at >= startMs && at <= endMs;
  });
}
