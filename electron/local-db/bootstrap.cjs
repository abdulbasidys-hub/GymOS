// The one-time bootstrap import (BUILD.md §15 decision #6) — NOT the sync
// engine. Writes an already-fetched bundle of a gym's current Firestore
// data into local SQLite, once, with sync_status: "synced" (this data
// already exists in the cloud — it's not a new local edit waiting to be
// pushed up). No ongoing pull, no conflict resolution.
//
// This file only WRITES to SQLite — it cannot itself call Firestore (no
// Firestore SDK in the main process, by design; auth/data access lives in
// the renderer). The actual fetch — calling the existing, unmodified
// getGym/listPlans/listMembers/etc. — happens renderer-side, in
// src/data/local/bootstrap.js, which sends the fetched bundle over IPC to
// the "bootstrapImport" operation this file implements.
//
// Runs as one transaction: either the whole bundle lands, or none of it
// does, rather than risking a half-seeded local database from a failed
// run partway through.

const { newId } = require("./helpers.cjs");

function seedGym(db, gym) {
  if (!gym) return;
  const s = gym.subscription || {};
  db.prepare(
    `INSERT OR REPLACE INTO gyms (
      id, name, prefix, address, status, member_seq, affiliate_id, affiliate_name,
      country_code, country_name, currency_code,
      subscription_activated_at, subscription_expiry_date, subscription_grace_hours,
      subscription_last_verified_at, subscription_locked, subscription_plan_id, subscription_plan_name,
      created_at, actor_uid, sync_status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'synced')`
  ).run(
    gym.id, gym.name ?? null, gym.prefix ?? null, gym.address ?? null, gym.status ?? null,
    gym.member_seq ?? 0, gym.affiliate_id ?? null, gym.affiliate_name ?? null,
    gym.country_code ?? null, gym.country_name ?? null, gym.currency_code ?? null,
    toIso(s.activated_at), toIso(s.expiry_date), s.grace_hours ?? null,
    toIso(s.last_verified_at), s.locked ? 1 : 0, s.plan_id ?? null, s.plan_name ?? null,
    toIso(gym.created_at), gym.actor_uid ?? null
  );
}

function seedUsers(db, users) {
  const stmt = db.prepare(
    `INSERT OR REPLACE INTO users (id, role, name, username, gym_id, gym_ids, phone, address, email, active, must_change_password, created_at, actor_uid, sync_status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'synced')`
  );
  for (const u of users || []) {
    stmt.run(
      u.id, u.role ?? null, u.name ?? null, u.username ?? null, u.gym_id ?? null,
      u.gym_ids ? JSON.stringify(u.gym_ids) : null,
      u.phone ?? null, u.address ?? null, u.email ?? null,
      u.active === false ? 0 : 1, u.must_change_password ? 1 : 0,
      toIso(u.created_at), u.actor_uid ?? null
    );
  }
}

function seedPlans(db, plans) {
  const stmt = db.prepare(
    `INSERT OR REPLACE INTO plans (id, gym_id, type, name, duration_count, duration_unit, price, active, created_at, actor_uid, sync_status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'synced')`
  );
  for (const p of plans || []) {
    stmt.run(p.id, p.gym_id ?? null, p.type ?? null, p.name ?? null, p.duration_count ?? null,
      p.duration_unit ?? null, p.price ?? null, p.active === false ? 0 : 1, toIso(p.created_at), p.actor_uid ?? null);
  }
}

function seedCustomFields(db, fields) {
  const stmt = db.prepare(
    `INSERT OR REPLACE INTO custom_fields (id, gym_id, label, type, required, active, created_at, actor_uid, sync_status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'synced')`
  );
  for (const f of fields || []) {
    stmt.run(f.id, f.gym_id ?? null, f.label ?? null, f.type ?? null, f.required ? 1 : 0,
      f.active === false ? 0 : 1, toIso(f.created_at), f.actor_uid ?? null);
  }
}

function seedMembers(db, members) {
  const stmt = db.prepare(
    `INSERT OR REPLACE INTO members (
      id, gym_id, member_no, name, phone, dob, gender, weight, height, date_joined,
      emergency_name, emergency_phone, email, address, custom_fields, active, created_at, actor_uid,
      photo_url, sync_status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'synced')`
  );
  for (const m of members || []) {
    stmt.run(
      m.id, m.gym_id ?? null, m.member_no ?? null, m.name ?? null, m.phone ?? null,
      m.dob ?? null, m.gender ?? null, m.weight ?? null, m.height ?? null, toIso(m.date_joined),
      m.emergency_name ?? null, m.emergency_phone ?? null, m.email ?? null, m.address ?? null,
      m.custom_fields ? JSON.stringify(m.custom_fields) : null,
      m.active === false ? 0 : 1, toIso(m.created_at), m.actor_uid ?? null,
      m.photo_url ?? null
    );
  }
}

function seedFactTable(db, table, rows, columnMap) {
  if (!rows || rows.length === 0) return;
  const columns = Object.keys(columnMap);
  const placeholders = columns.map(() => "?").join(", ");
  const stmt = db.prepare(
    `INSERT OR REPLACE INTO ${table} (${columns.join(", ")}, created_at, actor_uid, sync_status, adjusts_id, is_adjustment)
     VALUES (${placeholders}, ?, ?, 'synced', ?, ?)`
  );
  for (const row of rows) {
    const values = columns.map((col) => {
      const val = columnMap[col](row);
      return val instanceof Date ? val.toISOString() : val ?? null;
    });
    stmt.run(...values, toIso(row.created_at), row.actor_uid ?? null, row.adjusts_id ?? null, row.is_adjustment ? 1 : 0);
  }
}

// Purely defensive at this point — src/data/local/bootstrap.js now
// converts every Timestamp to an ISO string in the RENDERER, before the
// IPC call, since a Timestamp instance can't survive Electron's
// structured-clone (its prototype methods, including .toDate, don't
// cross that boundary). The `.toDate` branch below can never actually
// fire anymore; kept only so a plain string (the real, only case that
// reaches here now) and a bare Date both still pass through correctly.
function toIso(value) {
  if (value === undefined || value === null) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value.toDate === "function") return value.toDate().toISOString();
  return value;
}

// Six tables get cursor-based incremental pull (BUILD.md §15) — the same
// five FACT tables plus members (create-only, no update path anywhere in
// the app, so it behaves like a 6th FACT table for this purpose).
const CURSOR_TABLES = ["payments", "attendance", "membership_records", "equipment_records", "activity_log", "members"];

function seedCursors(db, gymId, cursorSeed) {
  if (!cursorSeed) return;
  const stmt = db.prepare("INSERT OR REPLACE INTO sync_meta (gym_id, key, value) VALUES (?, ?, ?)");
  for (const table of CURSOR_TABLES) stmt.run(gymId, `cursor:${table}`, cursorSeed);
}

/**
 * `bundle` — everything fetched renderer-side via the existing Firestore
 * functions for one gym: { gym, staff, plans, customFields, members,
 * payments, membershipRecords, equipmentRecords, attendance, activityLog,
 * cursorSeed }. Any key can be omitted/empty; each seeder is a no-op on
 * empty input. `cursorSeed` (an ISO string captured just before the
 * renderer's Firestore fetches began) becomes every table's starting
 * pull cursor, so the first real pull cycle doesn't re-fetch this gym's
 * entire history.
 */
function bootstrapImport(db, bundle) {
  const tx = db.transaction(() => {
    seedGym(db, bundle.gym);
    seedUsers(db, bundle.staff);
    seedPlans(db, bundle.plans);
    seedCustomFields(db, bundle.customFields);
    seedMembers(db, bundle.members);
    if (bundle.gym?.id) seedCursors(db, bundle.gym.id, bundle.cursorSeed);

    seedFactTable(db, "payments", bundle.payments, {
      id: (r) => r.id, gym_id: (r) => r.gym_id, member_id: (r) => r.member_id,
      receptionist_uid: (r) => r.receptionist_uid, plan_id: (r) => r.plan_id,
      plan_name: (r) => r.plan_name, plan_type: (r) => r.plan_type, amount: (r) => r.amount,
      for_type: (r) => r.for, duration_count: (r) => r.duration_count,
      duration_unit: (r) => r.duration_unit, paid_at: (r) => r.paid_at,
    });
    seedFactTable(db, "membership_records", bundle.membershipRecords, {
      id: (r) => r.id, gym_id: (r) => r.gym_id, member_id: (r) => r.member_id,
      plan_id: (r) => r.plan_id, plan_name: (r) => r.plan_name,
      start_date: (r) => r.start_date, expiry_date: (r) => r.expiry_date, payment_id: (r) => r.payment_id,
    });
    seedFactTable(db, "equipment_records", bundle.equipmentRecords, {
      id: (r) => r.id, gym_id: (r) => r.gym_id, member_id: (r) => r.member_id,
      plan_id: (r) => r.plan_id, plan_name: (r) => r.plan_name,
      start_date: (r) => r.start_date, expiry_date: (r) => r.expiry_date, payment_id: (r) => r.payment_id,
    });
    seedFactTable(db, "attendance", bundle.attendance, {
      id: (r) => r.id, gym_id: (r) => r.gym_id, member_id: (r) => r.member_id,
      receptionist_uid: (r) => r.receptionist_uid, recorded_at: (r) => r.recorded_at,
    });
    seedFactTable(db, "activity_log", bundle.activityLog, {
      id: (r) => r.id, gym_id: (r) => r.gym_id, action: (r) => r.action,
      target: (r) => r.target, at: (r) => r.at,
    });
  });

  tx();
  return { ok: true };
}

module.exports = { bootstrapImport };
