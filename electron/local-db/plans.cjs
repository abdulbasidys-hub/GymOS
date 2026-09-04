// Local mirror of src/data/plans.js. A mutable entity — doesn't route
// through ledger.cjs, so (unlike the FACT tables) every function here
// needs its own implementation, not just a read-side counterpart.

const { newId, nowIso } = require("./helpers.cjs");

function rowToPlan(row) {
  if (!row) return null;
  return { ...row, active: !!row.active };
}

function createPlan(db, { gymId, type, name, price, durationCount, durationUnit, actorUid }) {
  const id = newId();
  const created_at = nowIso();
  const duration_count = type === "membership" ? 1 : Number(durationCount);
  const duration_unit = type === "membership" ? "year" : durationUnit;

  db.prepare(
    `INSERT INTO plans (id, gym_id, type, name, duration_count, duration_unit, price, active, created_at, actor_uid, sync_status)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, 'pending')`
  ).run(id, gymId, type, String(name).trim(), duration_count, duration_unit, Number(price), created_at, actorUid ?? null);

  return rowToPlan(db.prepare("SELECT * FROM plans WHERE id = ?").get(id));
}

function listPlans(db, { gymId }) {
  return db
    .prepare("SELECT * FROM plans WHERE gym_id = ?")
    .all(gymId)
    .map(rowToPlan)
    .sort((a, b) => a.name.localeCompare(b.name));
}

// Every UPDATE below now also sets sync_status='pending' (BUILD.md §15,
// Phase 3) — without this, push's getPendingEntityRows query would never
// find a locally-edited plan, since bootstrap-imported rows start out
// 'synced' and nothing was flipping them back.
function updatePlan(db, { planId, name, price, durationCount, durationUnit }) {
  const current = db.prepare("SELECT * FROM plans WHERE id = ?").get(planId);
  if (!current) throw new Error("Plan not found");
  db.prepare(
    `UPDATE plans SET name = ?, price = ?, duration_count = ?, duration_unit = ?, sync_status = 'pending' WHERE id = ?`
  ).run(
    name !== undefined ? String(name).trim() : current.name,
    price !== undefined ? Number(price) : current.price,
    durationCount !== undefined ? Number(durationCount) : current.duration_count,
    durationUnit !== undefined ? durationUnit : current.duration_unit,
    planId
  );
}

function retirePlan(db, { planId }) {
  db.prepare("UPDATE plans SET active = 0, sync_status = 'pending' WHERE id = ?").run(planId);
}

function reactivatePlan(db, { planId }) {
  db.prepare("UPDATE plans SET active = 1, sync_status = 'pending' WHERE id = ?").run(planId);
}

module.exports = { createPlan, listPlans, updatePlan, retirePlan, reactivatePlan, rowToPlan };
