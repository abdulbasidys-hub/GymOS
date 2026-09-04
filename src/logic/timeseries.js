// Day-bucketing for trend charts. Pure — no storage, no UI.

import { toDate, startOfDay } from "../lib/helpers";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Bucket `items` into `days` consecutive daily buckets ending "today" (`now`).
 * `getDate(item)` returns the item's timestamp field; `getValue(item)` returns
 * the amount to add into that day's bucket (e.g. 1 for a count, an amount for
 * revenue). Returns oldest-first: [{ date, value }, ...], length === days.
 */
export function dailyBuckets(items, days, getDate, getValue, now = new Date()) {
  const todayStart = startOfDay(now).getTime();
  const firstStart = todayStart - (days - 1) * DAY_MS;

  const buckets = Array.from({ length: days }, (_, i) => ({
    date: new Date(firstStart + i * DAY_MS),
    value: 0,
  }));

  for (const item of items || []) {
    const t = toDate(getDate(item))?.getTime();
    if (t == null) continue;
    const idx = Math.round((startOfDay(new Date(t)).getTime() - firstStart) / DAY_MS);
    if (idx >= 0 && idx < days) buckets[idx].value += getValue(item);
  }

  return buckets;
}
