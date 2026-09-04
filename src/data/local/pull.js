// Phase 3, pull side, Milestone 1 (BUILD.md §15) — renderer side. Refetches
// the 4 mutable entity collections (gyms/plans/custom_fields/users) for a
// gym straight from Firestore and hands each to its own
// electron/local-db/pull.cjs operation, which applies the local-always-
// wins conflict policy (a row still sync_status:'pending' locally is left
// untouched) and writes the result into SQLite.
//
// Cursor-based incremental pull for the FACT tables + members is a
// separate, later pass (Milestone 2) — not built here.
//
// Deliberately reads Firestore DIRECTLY here (bypassing src/data/index.js),
// same reasoning as src/data/local/bootstrap.js: those functions are
// exactly what's branched on window.gymOS.isElectron, and this file only
// runs inside Electron, so importing them would just route back to the
// (already-local) database instead of Firestore. Each read below is a
// deliberately small, direct duplicate of the matching query, not a new
// shared abstraction — same call bootstrap.js already made.

import { collection, doc, getDoc, getDocs, limit, orderBy, query, where } from "firebase/firestore";
import { db } from "../firebase";
import { localInvoke } from "./bridge";
import { ENTITY_TIMESTAMP_FIELDS, FACT_TIMESTAMP_FIELDS, rowToIso, gymToIso, toTimestampValue } from "./timestamps";
import { syncMemberPhotos } from "./photoCache";

// One page's worth of cursor-pulled FACT/member rows per table per sync
// cycle (Milestone 2, BUILD.md §15) — a large backlog catches up over
// several cycles (Milestone 3's triggers) rather than in one shot, same
// bounded-per-cycle posture push already has for its own batches.
const PAGE_SIZE = 400;

// FACT tables are append-only (never updated after creation, in Firestore
// or locally) — members are pulled through the same cursor machinery, with
// their own apply operation (member_no's UNIQUE constraint needs per-row
// collision handling FACT tables don't).
//
// Members are NOT append-only, unlike the FACT tables: a photo is attached
// after registration, and the desk can edit name/phone/etc. A `created_at`
// cursor surfaces every NEW member but can never see an EDIT to one it has
// already walked past, so members get a SECOND pass in pullFactAndMembers
// cursored on `updated_at` (stamped by every member write). The two are
// complementary and neither is redundant: `created_at` never revisits a
// row, and `updated_at` never sees a member that has not been edited since
// registration, because orderBy silently drops documents missing the field.
const FACT_CURSOR_TABLES = ["payments", "attendance", "membership_records", "equipment_records", "activity_log"];

// Gyms whose members have been fully reconciled in THIS app session. See
// reconcileMembersOnce for why once-per-session is the right frequency.
const membersReconciled = new Set();

/**
 * One full members refetch per gym per app session, applied over whatever
 * the local database already holds.
 *
 * Neither cursor pass can repair a member that was edited BEFORE this
 * device last synced it: `created_at` has already walked past the row, and
 * `updated_at` can only find documents that HAVE an updated_at field —
 * `orderBy` silently drops the ones that don't. Every member edited or
 * photographed before updated_at stamping existed falls in that hole, and
 * stays there forever. The symptom is a member whose photo shows on the
 * web but never in the desktop app.
 *
 * A full refetch is the honest fix: it needs no backfill script, no new
 * composite index (single-field gym_id equality), and no rules change —
 * and unlike a targeted photo query it repairs any stale field, not just
 * the one that happened to be noticed.
 *
 * Once per session, not per cycle, because it costs one document read per
 * member: fine occasionally, wasteful every few minutes. The cursor passes
 * stay the steady-state mechanism; this is the self-heal that runs when
 * the app opens. applyPulledMembersPage is idempotent on id and refuses to
 * overwrite rows with unpushed local edits, so re-applying is safe.
 */
async function reconcileMembersOnce(gymId) {
  if (membersReconciled.has(gymId)) return;
  const rows = await fetchByGymId("members", gymId);
  if (rows.length > 0) await localInvoke("applyPulledMembersPage", { members: rows });
  // Only marked done on success — a failed attempt should retry next cycle
  // rather than leaving the device stuck with stale rows until restart.
  membersReconciled.add(gymId);
}

async function fetchGym(gymId) {
  const snap = await getDoc(doc(db, "gyms", gymId));
  return snap.exists() ? gymToIso({ id: snap.id, ...snap.data() }) : null;
}

/** Just the signed-in user's own document — the one users read a
 *  receptionist is permitted. Returns an array so callers can treat it
 *  identically to fetchByGymId's result. */
async function fetchOwnUser(uid) {
  if (!uid) return [];
  const snap = await getDoc(doc(db, "users", uid));
  return snap.exists() ? [rowToIso("users", { id: snap.id, ...snap.data() }, ENTITY_TIMESTAMP_FIELDS)] : [];
}

async function fetchByGymId(collectionName, gymId) {
  const snap = await getDocs(query(collection(db, collectionName), where("gym_id", "==", gymId)));
  return snap.docs.map((d) => rowToIso(collectionName, { id: d.id, ...d.data() }, ENTITY_TIMESTAMP_FIELDS));
}

/** Milestone 2 (BUILD.md §15) — one cursor-bounded page of a gym-scoped,
 *  append-only collection (the 5 FACT tables + members), ordered so a
 *  page boundary can resume cleanly next cycle. `cursor` (an ISO string,
 *  or undefined on a table's first-ever pull) is compared inclusively
 *  (`>=`) — safe against two rows sharing a `created_at`, since the
 *  matching electron/local-db/pull.cjs apply functions are idempotent on
 *  `id` and simply no-op on the one-row overlap this causes. */
async function fetchGymScopedPage(collectionName, gymId, cursor, fieldMap, orderField = "created_at") {
  const constraints = [where("gym_id", "==", gymId)];
  if (cursor) constraints.push(where(orderField, ">=", toTimestampValue(cursor)));
  // orderBy on the cursor field also acts as an existence filter: Firestore
  // omits documents missing that field entirely. That is exactly what the
  // "members_updated" pass wants — a member never edited since registration
  // has no updated_at and has nothing to re-apply.
  const snap = await getDocs(
    query(collection(db, collectionName), ...constraints, orderBy(orderField), limit(PAGE_SIZE))
  );
  return snap.docs.map((d) => rowToIso(collectionName, { id: d.id, ...d.data() }, fieldMap));
}

/** firestore.rules gates plans/custom_fields/members reads behind
 *  gymIsOperational() but never the gym doc itself — mirrored here: a
 *  suspended/locked gym is always fetched and applied (that write, plus
 *  the emitGymChanged it triggers, is the actual mechanism that gets a
 *  suspension to an already-open offline session), but nothing else in
 *  this cycle is worth fetching once the gym isn't operational — those
 *  reads would just throw permission-denied. */
function isOperational(gym) {
  return !!gym && gym.status === "active" && !(gym.subscription && gym.subscription.locked === true);
}

/**
 * Refetches gyms/plans/custom_fields/users for `gymId` and applies each to
 * local SQLite. No-op outside Electron. Each collection is fetched/applied
 * independently and swallows its own failure (logged, left for the next
 * cycle) — one collection erroring must never block the other three, same
 * per-table independence pushPendingChanges already established.
 */
export async function pullRemoteChanges(gymId, viewer = {}) {
  if (!window.gymOS?.isElectron || !gymId) return;

  let gym = null;
  try {
    gym = await fetchGym(gymId);
    await localInvoke("applyPulledGym", { gym });
  } catch (err) {
    console.error("Pull failed for gym (will retry next cycle):", err);
  }

  if (!isOperational(gym)) return;

  // A RECEPTIONIST cannot list the gym's users — firestore.rules gives them
  // read on their OWN user document only (`request.auth.uid == uid`), so the
  // gym-wide query below is denied outright for them. That is the rule
  // working as intended, not a gap to widen: a receptionist has no business
  // reading colleagues' records. Fetch just their own document instead, which
  // is all the desk actually needs locally (offline session + "who am I").
  try {
    const users =
      viewer.role === "receptionist"
        ? await fetchOwnUser(viewer.uid)
        : await fetchByGymId("users", gymId);
    if (users.length > 0) await localInvoke("applyPulledUsers", { users });
  } catch (err) {
    console.error("Pull failed for users (will retry next cycle):", err);
  }

  try {
    const plans = await fetchByGymId("plans", gymId);
    await localInvoke("applyPulledPlans", { plans });
  } catch (err) {
    console.error("Pull failed for plans (will retry next cycle):", err);
  }

  try {
    const customFields = await fetchByGymId("custom_fields", gymId);
    await localInvoke("applyPulledCustomFields", { gymId, customFields });
  } catch (err) {
    console.error("Pull failed for custom fields (will retry next cycle):", err);
  }
}

/**
 * Milestone 2 (BUILD.md §15) — cursor-based pull for the 5 FACT tables
 * plus `members`. No-op outside Electron. Reads every table's stored
 * cursor once, then per table: fetch one page (≤`PAGE_SIZE` rows) newer
 * than its cursor, apply it, advance the cursor to how far that page's
 * apply actually got. One table failing/timing out doesn't block the
 * others — same per-table independence as pullRemoteChanges/push.
 *
 * Deliberately separate from pullRemoteChanges (entity refetch) rather
 * than merged into it — different shape (cursor pagination vs. full
 * refetch-and-diff) and, per auth.jsx's ordering, entities are meant to
 * land first every cycle regardless of whether this call errors.
 */
export async function pullFactAndMembers(gymId, viewer = {}) {
  if (!window.gymOS?.isElectron || !gymId) return;

  const cursors = await localInvoke("getPullCursors", { gymId }).catch(() => ({}));

  // A receptionist may only read activity_log rows they THEMSELVES wrote
  // (firestore.rules checks resource.data.actor_uid == request.auth.uid).
  // A gym-wide query can't satisfy that — Firestore rejects any list query
  // it cannot prove safe from the query alone — so this pass is denied for
  // them every cycle. Skipped rather than narrowed with an actor_uid filter:
  // that would need a new composite index, and the desk has no use for the
  // activity feed anyway. It only ever WRITES these rows (push is
  // unaffected); the owner's dashboard is what reads them back.
  const tables =
    viewer.role === "receptionist"
      ? FACT_CURSOR_TABLES.filter((t) => t !== "activity_log")
      : FACT_CURSOR_TABLES;

  for (const table of tables) {
    try {
      const rows = await fetchGymScopedPage(table, gymId, cursors[table], FACT_TIMESTAMP_FIELDS);
      if (rows.length === 0) continue;
      await localInvoke("applyPulledFactPage", { table, rows });
      await localInvoke("setPullCursor", { gymId, table, value: rows[rows.length - 1].created_at });
    } catch (err) {
      console.error(`Pull failed for ${table} (will retry next cycle):`, err);
    }
  }

  try {
    const rows = await fetchGymScopedPage("members", gymId, cursors.members, ENTITY_TIMESTAMP_FIELDS);
    if (rows.length > 0) {
      const result = await localInvoke("applyPulledMembersPage", { members: rows });
      if (result.cursorAdvancedTo) {
        await localInvoke("setPullCursor", { gymId, table: "members", value: result.cursorAdvancedTo });
      }
    }
  } catch (err) {
    console.error("Pull failed for members (will retry next cycle):", err);
  }

  // Second members pass, ordered by `updated_at` instead of `created_at`.
  // The pass above finds members this device has never seen; this one
  // finds EDITS to members it already holds — a photo attached after
  // registration, a corrected phone number, a changed emergency contact.
  // Neither pass can do the other's job: a created_at cursor never
  // revisits a row, and an updated_at cursor never sees a member that has
  // not been edited since creation (no updated_at field at all on those).
  //
  // Its own cursor key ("members_updated") so the two never fight over one
  // stored position. applyPulledMembersPage is idempotent on `id` and
  // refuses to overwrite rows with unpushed local changes, so it is safe
  // to hand it rows the first pass already applied.
  try {
    const rows = await fetchGymScopedPage(
      "members", gymId, cursors.members_updated, ENTITY_TIMESTAMP_FIELDS, "updated_at"
    );
    if (rows.length > 0) {
      await localInvoke("applyPulledMembersPage", { members: rows });
      const last = rows[rows.length - 1].updated_at;
      if (last) {
        await localInvoke("setPullCursor", { gymId, table: "members_updated", value: last });
      }
    }
  } catch (err) {
    console.error("Pull failed for member updates (will retry next cycle):", err);
  }

  // Before the photo pass, because it's what makes photo_url correct for
  // members this device synced before updated_at stamping existed — without
  // it those photos are never discovered at all.
  try {
    await reconcileMembersOnce(gymId);
  } catch (err) {
    console.error("Member reconcile failed (will retry next cycle):", err);
  }

  // Last, and deliberately so: photo files are the largest and least
  // urgent thing pulled. Every member pass above has already landed, so
  // photo_url is current before this decides what to download, and a slow
  // photo backlog can never delay the records the desk actually needs to
  // check someone in. Swallows its own errors internally.
  await syncMemberPhotos(gymId);
}
