// Duration math for memberships and equipment plans. Pure — no storage, no UI.
//
//   day             → end of the PURCHASE day (local midnight). Buy any time
//                     today, valid through today; tomorrow they pay again.
//   week/month/year → by calendar, from the start date (buy weekly on the
//                     5th → active through the 11th), regardless of visits.

import { toDate } from "../lib/helpers";

/** Midnight at the START of the day AFTER `date` (i.e. end of `date`), local time. */
function endOfDay(date) {
  const d = new Date(date);
  d.setHours(24, 0, 0, 0);
  return d;
}

/**
 * Compute an expiry Date from a start date + duration.
 * @param {Date|string} startDate
 * @param {number} count
 * @param {"day"|"week"|"month"|"year"} unit
 */
export function computeExpiry(startDate, count, unit) {
  const start = toDate(startDate) ?? new Date();

  if (unit === "day") {
    const d = new Date(start);
    d.setDate(d.getDate() + (count - 1)); // count=1 (the common case) → today
    return endOfDay(d);
  }

  const expiry = new Date(start);
  if (unit === "week") expiry.setDate(expiry.getDate() + count * 7);
  else if (unit === "month") expiry.setMonth(expiry.getMonth() + count);
  else if (unit === "year") expiry.setFullYear(expiry.getFullYear() + count);
  else throw new Error(`Unknown duration unit: ${unit}`);
  return expiry;
}

/** Is this expiry date still in the future? */
export function isActive(expiryDate, now = new Date()) {
  const expiry = toDate(expiryDate);
  return !!expiry && expiry.getTime() > now.getTime();
}

/**
 * Given a member's records for ONE track (all their membership_records, or
 * all their equipment_records), return the one with the latest expiry_date —
 * that's the current standing. Renewals always push expiry forward, so
 * "latest expiry" means "current record," independent of creation order.
 */
export function currentRecord(records) {
  if (!records || records.length === 0) return null;
  return records.reduce((latest, r) => {
    if (!latest) return r;
    const a = toDate(r.expiry_date)?.getTime() ?? -Infinity;
    const b = toDate(latest.expiry_date)?.getTime() ?? -Infinity;
    return a > b ? r : latest;
  }, null);
}

/**
 * From a list of records ALL of one type (every gym's membership_records, or
 * every equipment_records) across many members, return each member's CURRENT
 * record where that current record expires within the next `days` days.
 * Already-expired records are excluded — this is a renewal CHASE list, not
 * an expired list (the owner's "expiring-soon" report, BUILD.md §9).
 */
export function expiringSoon(records, days = 7, now = new Date()) {
  const byMember = new Map();
  for (const r of records || []) {
    if (!byMember.has(r.member_id)) byMember.set(r.member_id, []);
    byMember.get(r.member_id).push(r);
  }

  const horizon = now.getTime() + days * 24 * 60 * 60 * 1000;
  const result = [];
  for (const memberRecords of byMember.values()) {
    const current = currentRecord(memberRecords);
    const expiry = toDate(current?.expiry_date)?.getTime();
    if (expiry != null && expiry > now.getTime() && expiry <= horizon) {
      result.push(current);
    }
  }
  return result.sort(
    (a, b) => toDate(a.expiry_date).getTime() - toDate(b.expiry_date).getTime()
  );
}
