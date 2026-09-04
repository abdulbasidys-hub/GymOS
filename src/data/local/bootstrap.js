// The one-time bootstrap import (BUILD.md §15 decision #6) — renderer
// side. Fetches a gym's current data straight from Firestore and hands
// the bundle to the main process's "bootstrapImport" operation, which
// writes it into local SQLite with sync_status: "synced". Not the sync
// engine — one-shot, no ongoing pull, no conflict resolution; just enough
// that Phase 2 has something to work with instead of an empty local
// database on a fresh install.
//
// Deliberately reads Firestore DIRECTLY here (collection/query/getDocs
// against `db` from ./firebase) rather than importing listMembers/getGym/
// etc. from ../index — those are the very functions this phase branches
// on window.gymOS.isElectron, and this file only runs inside Electron, so
// importing the branched versions would route straight back to the (still
// empty) local database instead of Firestore. Each read below is a
// deliberately small, direct duplicate of the matching src/data/*.js
// function's query — not a new abstraction, just enough to bypass the
// branch for this one bootstrapping purpose.
//
// Two real bugs fixed here (BUILD.md §15, found while designing pull —
// see that section for the full writeup):
// - fetchStaff used to filter to role=="receptionist" only, so an Owner's
//   own account could never be seeded locally — widened to every user in
//   the gym (naturally still excludes superadmin/affiliate, who have no
//   gym_id).
// - every fetched record now has its Timestamp fields converted to ISO
//   strings HERE, before the localInvoke(...) call — Electron's IPC
//   structured-clones its arguments, which strips a class instance's
//   prototype methods (including Timestamp.prototype.toDate), so this
//   conversion is only possible in the renderer, never after the fact in
//   the main process. Doing it main-process-side (the old approach) meant
//   every real gym's bootstrap silently failed and got swallowed by the
//   catch block below.

import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";
import { db } from "../firebase";
import { localInvoke } from "./bridge";
import { FACT_TIMESTAMP_FIELDS, ENTITY_TIMESTAMP_FIELDS, rowToIso, gymToIso } from "./timestamps";

async function fetchGym(gymId) {
  const snap = await getDoc(doc(db, "gyms", gymId));
  return snap.exists() ? gymToIso({ id: snap.id, ...snap.data() }) : null;
}
async function fetchByGymId(collectionName, gymId, fieldMap) {
  const snap = await getDocs(query(collection(db, collectionName), where("gym_id", "==", gymId)));
  return snap.docs.map((d) => rowToIso(collectionName, { id: d.id, ...d.data() }, fieldMap));
}
async function fetchStaff(gymId) {
  const snap = await getDocs(query(collection(db, "users"), where("gym_id", "==", gymId)));
  return snap.docs.map((d) => rowToIso("users", { id: d.id, ...d.data() }, ENTITY_TIMESTAMP_FIELDS));
}

/**
 * Seeds local SQLite from Firestore for `gymId`, but only if it looks like
 * this hasn't happened yet (no local gym row) — safe to call on every
 * sign-in rather than needing its own "have we already done this" flag.
 * Silently no-ops on failure (e.g. offline on a first Electron launch) —
 * this is a background convenience, not something that should block or
 * scare the user; without it the app just keeps working with whatever
 * local data already exists (none, the first time).
 */
export async function ensureBootstrapped(gymId) {
  if (!window.gymOS?.isElectron || !gymId) return;

  try {
    const alreadyLocal = await localInvoke("getGym", { gymId });
    if (alreadyLocal) return;

    // Captured BEFORE the fetches below, not after — this becomes pull's
    // starting cursor for every table. Using the pre-fetch time means
    // anything created DURING this bootstrap read window (a payment taken
    // on a different device in the few hundred ms this takes) is safely
    // re-included — idempotently, via pull's own INSERT OR IGNORE — by
    // the first real pull cycle, rather than possibly missed by a cursor
    // that started counting only after the fetches finished.
    const cursorSeed = new Date().toISOString();

    const [gym, staff, plans, customFields, members, payments, membershipRecords, equipmentRecords, attendance, activityLog] =
      await Promise.all([
        fetchGym(gymId),
        fetchStaff(gymId),
        fetchByGymId("plans", gymId, ENTITY_TIMESTAMP_FIELDS),
        fetchByGymId("custom_fields", gymId, ENTITY_TIMESTAMP_FIELDS),
        fetchByGymId("members", gymId, ENTITY_TIMESTAMP_FIELDS),
        fetchByGymId("payments", gymId, FACT_TIMESTAMP_FIELDS),
        fetchByGymId("membership_records", gymId, FACT_TIMESTAMP_FIELDS),
        fetchByGymId("equipment_records", gymId, FACT_TIMESTAMP_FIELDS),
        fetchByGymId("attendance", gymId, FACT_TIMESTAMP_FIELDS),
        fetchByGymId("activity_log", gymId, FACT_TIMESTAMP_FIELDS),
      ]);

    await localInvoke("bootstrapImport", {
      gym, staff, plans, customFields, members, payments, membershipRecords, equipmentRecords, attendance, activityLog,
      cursorSeed,
    });
  } catch (err) {
    console.error("Bootstrap import skipped (likely offline on a fresh install):", err);
  }
}
