// Everything backed by the `sync_meta(gym_id, key, value)` table (schema
// v2) — Phase 3 Milestone 2's pull cursors AND Phase 4's forward-only
// clock anchor. Grouped here because they're the same table, not because
// they're conceptually one feature.

/** Every `cursor:<table>` row for a gym, keyed by table name (the
 *  `cursor:` prefix stripped) -> its ISO-string value. Absent for a table
 *  that's never been pulled yet — the renderer treats that as "fetch from
 *  the beginning." */
function getPullCursors(db, { gymId }) {
  const rows = db.prepare("SELECT key, value FROM sync_meta WHERE gym_id = ? AND key LIKE 'cursor:%'").all(gymId);
  const out = {};
  for (const row of rows) out[row.key.slice("cursor:".length)] = row.value;
  return out;
}

function setPullCursor(db, { gymId, table, value }) {
  db.prepare("INSERT OR REPLACE INTO sync_meta (gym_id, key, value) VALUES (?, ?, ?)").run(gymId, `cursor:${table}`, value);
}

/** BUILD.md §13's "Option A" offline license enforcement needs a clock
 *  that can't be walked backward by resetting the OS clock. Same math as
 *  `logic/license.js`'s own `advanceClock` (max of what's stored vs. what
 *  was just observed), just persisted so it survives an app restart —
 *  otherwise a relaunch after rolling the clock back would simply forget
 *  the later time it had already seen. */
function advanceForwardClock(db, { gymId, now }) {
  const row = db.prepare("SELECT value FROM sync_meta WHERE gym_id = ? AND key = 'clock:last_seen_at'").get(gymId);
  const stored = row?.value ? new Date(row.value) : null;
  const observed = new Date(now);
  const winner = !stored || observed.getTime() > stored.getTime() ? observed : stored;
  const winnerIso = winner.toISOString();
  db.prepare("INSERT OR REPLACE INTO sync_meta (gym_id, key, value) VALUES (?, ?, ?)").run(gymId, "clock:last_seen_at", winnerIso);
  return { now: winnerIso };
}

module.exports = { getPullCursors, setPullCursor, advanceForwardClock };
