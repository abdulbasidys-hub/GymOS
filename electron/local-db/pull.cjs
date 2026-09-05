// Phase 3, pull side, Milestone 1 — BUILD.md §15: full-refetch-and-merge
// for the 4 mutable entity collections (gyms/plans/custom_fields/users),
// closing the real, current gap where nothing ever notices a gym being
// suspended/locked (or a plan/staff edit) made from the web while an
// Electron session sits offline. Cursor-based incremental pull for the
// FACT tables + members is a separate, later pass (Milestone 2) — not
// built here.
//
// Every apply function is the single-statement expression of the locked-
// in conflict policy (local-always-wins via push-before-pull ordering):
// INSERT if the row is new, overwrite-and-mark-synced if it exists and
// ISN'T locally dirty, leave completely untouched if it's still
// sync_status='pending' (meaning: not yet pushed, or push failed — a
// stale remote copy must never clobber that). SQLite's
// `ON CONFLICT DO UPDATE ... WHERE` is exactly this in one statement: the
// WHERE gates whether the UPDATE branch applies at all.
//
// Each transaction commits (or fails) independently — a `custom_fields`
// read/apply failing must never prevent `plans` from landing, same
// per-table independence src/data/local/sync.js's pushFactTable/
// pushEntityTable already established for push.

const { emitGymChanged, emitUserChanged } = require("./watchers.cjs");
const { FACT_TABLES } = require("./ledger.cjs");

function applyPulledGym(db, { gym }) {
  if (!gym) return { changed: false };
  const s = gym.subscription || {};
  const info = db
    .prepare(
      `INSERT INTO gyms (
        id, name, prefix, address, status, member_seq, affiliate_id, affiliate_name,
        country_code, country_name, currency_code,
        subscription_activated_at, subscription_expiry_date, subscription_grace_hours,
        subscription_last_verified_at, subscription_locked, subscription_plan_id, subscription_plan_name,
        created_at, actor_uid, sync_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'synced')
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name, prefix = excluded.prefix, address = excluded.address, status = excluded.status,
        member_seq = excluded.member_seq, affiliate_id = excluded.affiliate_id, affiliate_name = excluded.affiliate_name,
        country_code = excluded.country_code, country_name = excluded.country_name, currency_code = excluded.currency_code,
        subscription_activated_at = excluded.subscription_activated_at, subscription_expiry_date = excluded.subscription_expiry_date,
        subscription_grace_hours = excluded.subscription_grace_hours, subscription_last_verified_at = excluded.subscription_last_verified_at,
        subscription_locked = excluded.subscription_locked, subscription_plan_id = excluded.subscription_plan_id,
        subscription_plan_name = excluded.subscription_plan_name, created_at = excluded.created_at, actor_uid = excluded.actor_uid,
        sync_status = 'synced'
      WHERE gyms.sync_status != 'pending'`
    )
    .run(
      gym.id, gym.name ?? null, gym.prefix ?? null, gym.address ?? null, gym.status ?? null,
      gym.member_seq ?? 0, gym.affiliate_id ?? null, gym.affiliate_name ?? null,
      gym.country_code ?? null, gym.country_name ?? null, gym.currency_code ?? null,
      s.activated_at ?? null, s.expiry_date ?? null, s.grace_hours ?? null,
      s.last_verified_at ?? null, s.locked ? 1 : 0, s.plan_id ?? null, s.plan_name ?? null,
      gym.created_at ?? null, gym.actor_uid ?? null
    );

  if (info.changes > 0) emitGymChanged(db, gym.id);
  return { changed: info.changes > 0 };
}

function applyPulledUsers(db, { users }) {
  const stmt = db.prepare(
    `INSERT INTO users (id, role, name, username, gym_id, gym_ids, phone, address, email, active, must_change_password, created_at, actor_uid, sync_status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'synced')
     ON CONFLICT(id) DO UPDATE SET
       role = excluded.role, name = excluded.name, username = excluded.username, gym_id = excluded.gym_id,
       gym_ids = excluded.gym_ids,
       phone = excluded.phone, address = excluded.address, email = excluded.email, active = excluded.active,
       must_change_password = excluded.must_change_password, created_at = excluded.created_at, actor_uid = excluded.actor_uid,
       sync_status = 'synced'
     WHERE users.sync_status != 'pending'`
  );
  const changedUids = [];
  db.transaction(() => {
    for (const u of users || []) {
      const info = stmt.run(
        u.id, u.role ?? null, u.name ?? null, u.username ?? null, u.gym_id ?? null,
        u.gym_ids ? JSON.stringify(u.gym_ids) : null,
        u.phone ?? null, u.address ?? null, u.email ?? null,
        u.active === false ? 0 : 1, u.must_change_password ? 1 : 0,
        u.created_at ?? null, u.actor_uid ?? null
      );
      if (info.changes > 0) changedUids.push(u.id);
    }
  })();
  // Emitted after the transaction commits, not inside it — never notify a
  // subscriber of a write that could still roll back.
  for (const uid of changedUids) emitUserChanged(db, uid);
  return { changedCount: changedUids.length };
}

function applyPulledPlans(db, { plans }) {
  const stmt = db.prepare(
    `INSERT INTO plans (id, gym_id, type, name, duration_count, duration_unit, price, active, created_at, actor_uid, sync_status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'synced')
     ON CONFLICT(id) DO UPDATE SET
       gym_id = excluded.gym_id, type = excluded.type, name = excluded.name, duration_count = excluded.duration_count,
       duration_unit = excluded.duration_unit, price = excluded.price, active = excluded.active,
       created_at = excluded.created_at, actor_uid = excluded.actor_uid, sync_status = 'synced'
     WHERE plans.sync_status != 'pending'`
  );
  let changedCount = 0;
  db.transaction(() => {
    for (const p of plans || []) {
      const info = stmt.run(
        p.id, p.gym_id ?? null, p.type ?? null, p.name ?? null, p.duration_count ?? null,
        p.duration_unit ?? null, p.price ?? null, p.active === false ? 0 : 1, p.created_at ?? null, p.actor_uid ?? null
      );
      if (info.changes > 0) changedCount++;
    }
  })();
  return { changedCount };
}

/** The one entity with a real hard-delete path (deleteCustomField) — a
 *  field removed on another device would otherwise linger forever on an
 *  already-bootstrapped Electron install, since nothing else ever prunes
 *  a local row that's simply absent from a later fetch. Deletes any
 *  local, non-pending row whose id isn't in the freshly-fetched set —
 *  never touches a locally-pending row, same conflict policy as the
 *  upserts above. */
function applyPulledCustomFields(db, { gymId, customFields }) {
  const stmt = db.prepare(
    `INSERT INTO custom_fields (id, gym_id, label, type, required, active, created_at, actor_uid, sync_status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'synced')
     ON CONFLICT(id) DO UPDATE SET
       gym_id = excluded.gym_id, label = excluded.label, type = excluded.type, required = excluded.required,
       active = excluded.active, created_at = excluded.created_at, actor_uid = excluded.actor_uid, sync_status = 'synced'
     WHERE custom_fields.sync_status != 'pending'`
  );

  let changedCount = 0;
  let deletedCount = 0;
  db.transaction(() => {
    const fetchedIds = [];
    for (const f of customFields || []) {
      fetchedIds.push(f.id);
      const info = stmt.run(
        f.id, f.gym_id ?? null, f.label ?? null, f.type ?? null, f.required ? 1 : 0,
        f.active === false ? 0 : 1, f.created_at ?? null, f.actor_uid ?? null
      );
      if (info.changes > 0) changedCount++;
    }

    // `id NOT IN (...)` with a genuinely empty list can't be expressed by
    // just leaving the placeholder list empty — `id NOT IN (NULL)` (the
    // naive fallback) is SQL-NULL/"unknown" for every row, which SQLite
    // treats as false in a WHERE clause, silently matching zero rows
    // instead of "no id is exempt." So a gym pulled back with zero custom
    // fields would never prune any of its stale local ones. Omit the
    // NOT IN clause entirely in that case instead — every local
    // non-pending row for this gym is exempt from nothing, so all of them
    // are stale and should go.
    const deleted =
      fetchedIds.length > 0
        ? db
            .prepare(
              `DELETE FROM custom_fields WHERE gym_id = ? AND sync_status != 'pending' AND id NOT IN (${fetchedIds.map(() => "?").join(", ")})`
            )
            .run(gymId, ...fetchedIds)
        : db.prepare(`DELETE FROM custom_fields WHERE gym_id = ? AND sync_status != 'pending'`).run(gymId);
    deletedCount = deleted.changes;
  })();

  return { changedCount, deletedCount };
}

/**
 * Milestone 2 (BUILD.md §15) — one cursor-fetched page of a FACT table
 * (payments/attendance/membership_records/equipment_records/
 * activity_log). FACT rows are append-only everywhere (Firestore and
 * local alike — never updated after creation), so unlike the entity
 * apply functions above there's no conflict policy to express: a row
 * either doesn't exist locally yet (insert) or does (this device's own
 * copy paged back in, or something already synced — either way, ignore).
 * `INSERT OR IGNORE` on `id` (PRIMARY KEY) is exactly that in one
 * statement. Column list + the one `for`->`for_type` rename come from
 * ledger.cjs's `FACT_TABLES` — the same metadata `appendRecord` already
 * uses for local-create — rather than a third duplicate copy (a
 * duplicate copy of this exact kind of table metadata was a real,
 * confirmed bug last pass: src/data/local/sync.js's own local field map
 * silently drifted out of sync with the shared one).
 */
function applyPulledFactPage(db, { table, rows }) {
  const meta = FACT_TABLES[table];
  if (!meta) throw new Error(`applyPulledFactPage: "${table}" is not a local FACT table.`);
  const rename = meta.rename || {};

  const allColumns = [...meta.columns, "id", "created_at", "actor_uid", "sync_status", "adjusts_id", "is_adjustment"];
  const stmt = db.prepare(
    `INSERT OR IGNORE INTO ${table} (${allColumns.join(", ")}) VALUES (${allColumns.map(() => "?").join(", ")})`
  );

  let insertedCount = 0;
  db.transaction(() => {
    for (const row of rows || []) {
      const values = meta.columns.map((col) => {
        const jsKey = Object.keys(rename).find((k) => rename[k] === col) || col;
        return row[jsKey] ?? null;
      });
      const info = stmt.run(
        ...values, row.id, row.created_at ?? null, row.actor_uid ?? null, "synced",
        row.adjusts_id ?? null, row.is_adjustment ? 1 : 0
      );
      if (info.changes > 0) insertedCount++;
    }
  })();

  return { insertedCount };
}

/**
 * Milestone 2 (BUILD.md §15) — one cursor-fetched page of `members`.
 * Members are create-only like a FACT table, but carry a second,
 * device-independent constraint FACT tables don't have:
 * `UNIQUE(gym_id, member_no)`. A pulled member can rarely collide with a
 * member THIS device created offline (a guessed member_no) and hasn't
 * yet pushed — a plain `INSERT` (not `OR IGNORE`, so the violation is
 * visible rather than silently swallowed) lets that be caught per-row.
 * On collision, processing this page stops right there — `cursorAdvancedTo`
 * is left at the last row BEFORE the collision, so the next cycle retries
 * the same colliding row. Self-healing: this device's own push (which
 * runs before pull every cycle — see auth.jsx) corrects its conflicting
 * member's number via applyMemberRenumber, and the collision clears
 * itself on a later cycle without ever losing either member.
 */
function applyPulledMembersPage(db, { members }) {
  const stmt = db.prepare(
    `INSERT INTO members (
      id, gym_id, member_no, name, phone, dob, gender, weight, height, date_joined,
      emergency_name, emergency_phone, email, address, custom_fields, active, created_at, actor_uid,
      photo_url, sync_status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'synced')`
  );
  const existsStmt = db.prepare("SELECT sync_status FROM members WHERE id = ?");
  // Used only on a UNIQUE(gym_id, member_no) violation — finds which local
  // row is squatting on the number a pulled member needs.
  const existsByNoStmt = db.prepare("SELECT id, sync_status FROM members WHERE gym_id = ? AND member_no = ?");
  const renumberStmt = db.prepare("UPDATE members SET member_no = ? WHERE id = ?");

  // Members are NOT create-only any more: a member's photo is attached
  // after registration (photo_url), and firestore.rules permits editing
  // name/phone/gender/dob/weight/height/emergency/address/email/
  // custom_fields. Skipping every row that already exists locally, as this
  // did, meant a remote edit could never land on a device that had already
  // seen that member — the photo in particular would stay blank forever.
  //
  // Only rows marked 'synced' are refreshed. A 'pending' row has local
  // changes that have not reached Firestore yet, and overwriting it here
  // would silently destroy the desk's own work — push wins, and the next
  // pull picks the row up once it has been pushed.
  //
  // member_no is deliberately NOT refreshed: it is assigned locally and
  // reconciled by sync.cjs, and it carries the UNIQUE constraint this
  // function already has collision handling for.
  const updateStmt = db.prepare(
    `UPDATE members SET
       name = ?, phone = ?, dob = ?, gender = ?, weight = ?, height = ?,
       emergency_name = ?, emergency_phone = ?, email = ?, address = ?,
       custom_fields = ?, active = ?, photo_url = ?
     WHERE id = ? AND sync_status = 'synced'`
  );

  let insertedCount = 0;
  let cursorAdvancedTo = null;
  db.transaction(() => {
    for (const m of members || []) {
      const existing = existsStmt.get(m.id);
      if (existing) {
        if (existing.sync_status === "synced") {
          updateStmt.run(
            m.name ?? null, m.phone ?? null, m.dob ?? null, m.gender ?? null,
            m.weight ?? null, m.height ?? null,
            m.emergency_name ?? null, m.emergency_phone ?? null,
            m.email ?? null, m.address ?? null,
            m.custom_fields ? JSON.stringify(m.custom_fields) : null,
            m.active === false ? 0 : 1, m.photo_url ?? null,
            m.id
          );
        }
        cursorAdvancedTo = m.created_at;
        continue;
      }
      try {
        stmt.run(
          m.id, m.gym_id ?? null, m.member_no ?? null, m.name ?? null, m.phone ?? null,
          m.dob ?? null, m.gender ?? null, m.weight ?? null, m.height ?? null, m.date_joined ?? null,
          m.emergency_name ?? null, m.emergency_phone ?? null, m.email ?? null, m.address ?? null,
          m.custom_fields ? JSON.stringify(m.custom_fields) : null,
          m.active === false ? 0 : 1, m.created_at ?? null, m.actor_uid ?? null,
          m.photo_url ?? null
        );
        insertedCount++;
        cursorAdvancedTo = m.created_at;
      } catch (err) {
        if (!String(err.message).includes("UNIQUE")) throw err;

        // member_no collision. This used to `break`, on the assumption that
        // the next cycle would find it resolved — but it never can, and the
        // stall is total: the page stops here, so this member AND every
        // member after it stop arriving, indefinitely.
        //
        // It happens whenever a member registered offline on this device is
        // handed the same number that Firestore's own counter later gave to
        // a member registered elsewhere. Both hold SBG-0101; the local one
        // keeps it until it pushes; if the push is failing for any reason,
        // the pull is wedged forever.
        //
        // The remote row wins, because a local PENDING member's number is
        // provisional by design — sync.js recomputes it from Firestore's
        // member_seq inside the create transaction and calls
        // applyMemberRenumber afterwards, so whatever is sitting here now
        // was only ever a guess. Move the guess aside and let the
        // authoritative row land. The placeholder is unique per row (ids
        // are unique) so it cannot collide in turn, and it is visibly
        // provisional if anyone sees it before the push corrects it.
        const clash = existsByNoStmt.get(m.gym_id ?? null, m.member_no ?? null);
        if (clash && clash.sync_status === "pending" && clash.id !== m.id) {
          renumberStmt.run(`PENDING-${clash.id.slice(0, 8)}`, clash.id);
          stmt.run(
            m.id, m.gym_id ?? null, m.member_no ?? null, m.name ?? null, m.phone ?? null,
            m.dob ?? null, m.gender ?? null, m.weight ?? null, m.height ?? null, m.date_joined ?? null,
            m.emergency_name ?? null, m.emergency_phone ?? null, m.email ?? null, m.address ?? null,
            m.custom_fields ? JSON.stringify(m.custom_fields) : null,
            m.active === false ? 0 : 1, m.created_at ?? null, m.actor_uid ?? null,
            m.photo_url ?? null
          );
          insertedCount++;
          cursorAdvancedTo = m.created_at;
          continue;
        }
        // A collision with an already-SYNCED row is a genuine anomaly (two
        // synced members sharing a number should be impossible) — stop and
        // let it be investigated rather than papering over it.
        break;
      }
    }
  })();

  return { insertedCount, cursorAdvancedTo };
}

module.exports = {
  applyPulledGym,
  applyPulledUsers,
  applyPulledPlans,
  applyPulledCustomFields,
  applyPulledFactPage,
  applyPulledMembersPage,
};
