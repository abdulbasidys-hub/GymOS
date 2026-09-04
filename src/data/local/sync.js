// Phase 3, push side (BUILD.md §15) — renderer side. Reads everything
// locally-dirty (sync_status: 'pending') via the main process's
// electron/local-db/sync.cjs and writes it to Firestore, marking each
// record synced only once Firestore has confirmed it durably (never
// optimistically before). This file is why the push logic lives here and
// not in electron/local-db/: Firestore access only exists in the
// renderer, same constraint src/data/local/bootstrap.js already worked
// around for the same reason.
//
// Not the pull side — bringing remote changes back down into SQLite is a
// separate, later pass (see BUILD.md §15).

import {
  doc,
  setDoc,
  writeBatch,
  getDoc,
  runTransaction,
  deleteDoc,
} from "firebase/firestore";
import { db } from "../firebase";
import { localInvoke } from "./bridge";
import { formatMemberNumber } from "../../logic/memberNumber";
import { FACT_TIMESTAMP_FIELDS, ENTITY_TIMESTAMP_FIELDS, rowToTimestamps } from "./timestamps";

// Firestore write batches cap at 500 ops; 400 leaves headroom without
// needing to reason about exact per-op costs.
const BATCH_SIZE = 400;

/** A record queued locally is always 'pending' until this exact push
 *  confirms it — once it's actually being written to Firestore, it's
 *  becoming exactly what a web-created record already is: 'synced'. */
function prepareFactDoc(table, row) {
  const { sync_status, ...rest } = row;
  return rowToTimestamps(table, { ...rest, sync_status: "synced" }, FACT_TIMESTAMP_FIELDS);
}

/** Entity collections (plans/custom_fields/users/members) have NO
 *  sync_status field in Firestore today (confirmed during Phase 2/3
 *  design — only ledger.js-routed FACT records ever got one) — omit it
 *  here rather than introducing a field no other code expects on these
 *  collections. */
function prepareEntityDoc(table, row) {
  const { sync_status, ...rest } = row;
  return rowToTimestamps(table, rest, ENTITY_TIMESTAMP_FIELDS);
}

/** Firebase errors carry a machine-readable `code` ("permission-denied",
 *  "unavailable", "failed-precondition") that says far more than the
 *  message. Kept short and prefixed with what was being pushed, because
 *  this string ends up in front of whoever is standing at the desk — and,
 *  crucially, is the ONLY diagnostic they have: the packaged app has no
 *  menu and no DevTools, so a console.error reaches nobody. */
function describeFailure(what, err) {
  const code = err?.code || err?.name || "";
  const detail = code || err?.message || "unknown error";
  return `${what}: ${detail}`;
}

function chunk(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Pushes one table's pending rows as full-document `set`s (FACT records
 *  are self-contained facts, not partial edits — always safe to write in
 *  full) and marks each chunk synced only after its batch is confirmed
 *  durable. A failed chunk is logged and skipped, not thrown — leaving
 *  those rows 'pending' for the next cycle rather than aborting every
 *  other table's push over one failure. */
async function pushFactTable(table, rows, errors) {
  let failed = 0;
  for (const group of chunk(rows, BATCH_SIZE)) {
    try {
      const batch = writeBatch(db);
      for (const row of group) batch.set(doc(db, table, row.id), prepareFactDoc(table, row));
      await batch.commit();
      await localInvoke("markSynced", { table, ids: group.map((r) => r.id) });
    } catch (err) {
      console.error(`Sync push failed for ${table} (will retry next cycle):`, err);
      failed += group.length;
      errors.push(describeFailure(table, err));
    }
  }
  return failed;
}

/** Same idea as pushFactTable, but merge:true — these are edits to
 *  existing documents (a receptionist's phone number, a plan's price),
 *  not fresh creates, so a full non-merge overwrite could silently wipe
 *  a field this local schema doesn't happen to track. */
async function pushEntityTable(table, rows, errors) {
  let failed = 0;
  for (const group of chunk(rows, BATCH_SIZE)) {
    try {
      const batch = writeBatch(db);
      for (const row of group) batch.set(doc(db, table, row.id), prepareEntityDoc(table, row), { merge: true });
      await batch.commit();
      await localInvoke("markSynced", { table, ids: group.map((r) => r.id) });
    } catch (err) {
      console.error(`Sync push failed for ${table} (will retry next cycle):`, err);
      failed += group.length;
      errors.push(describeFailure(table, err));
    }
  }
  return failed;
}

/**
 * Members are pushed one at a time, not batched — the one non-idempotent-
 * by-default case (BUILD.md §15). Existence-check first: if the id is
 * already in Firestore, this is either (a) a prior cycle's create already
 * landed (interrupted before the local write-back) or (b) a bio-data EDIT
 * to an already-synced member (BUILD.md §15's member-editing pass) — both
 * skip the create transaction below, since member_seq is only ever
 * consumed once, at genuine creation.
 *
 * Confirmed real bug, fixed here: this used to just re-sync member_no
 * defensively and mark synced on the existence-check branch, without
 * ever writing the row's OTHER fields — meaning an offline edit to an
 * already-synced member (name/phone/dob/etc.) would get marked 'synced'
 * without the edit itself ever reaching Firestore. Now merge-writes the
 * current local fields first, same treatment pushEntityTable already
 * gives plans/custom_fields/users edits (merge:true — a full non-merge
 * overwrite could silently wipe a field this local schema doesn't track).
 *
 * When the member doesn't exist yet, reuses the exact transactional
 * pattern src/data/members.js's web-path createMember already uses:
 * member_no is always recomputed from Firestore's OWN current
 * member_seq (never the number local guessed offline), so two
 * independent counters (this device's local one vs. Firestore's) can
 * never collide — if the recomputed number differs from what local
 * originally assigned (someone else's create landed first),
 * applyMemberRenumber corrects the local row to match the now-
 * authoritative cloud number.
 */
async function pushMembers(gymId, members, gymPrefix, errors) {
  let failed = 0;
  for (const member of members) {
    try {
      const memberRef = doc(db, "members", member.id);
      const existing = await getDoc(memberRef);

      if (existing.exists()) {
        const remoteNo = existing.data().member_no;
        if (remoteNo && remoteNo !== member.member_no) {
          await localInvoke("applyMemberRenumber", { memberId: member.id, memberNo: remoteNo });
        } else {
          // created_at/date_joined deliberately excluded: they round-trip
          // through local storage as millisecond-precision ISO strings,
          // which can differ by a sub-millisecond fraction from
          // Firestore's original server-assigned Timestamp even though
          // nothing "really" changed — firestore.rules' bio-data-only
          // affectedKeys() allow-list (BUILD.md §15) would then reject
          // the whole write over a phantom diff. Neither field should
          // ever actually change on an edit, so simplest fix: never
          // resend them.
          const { created_at, date_joined, ...editableFields } = prepareEntityDoc("members", member);
          await setDoc(memberRef, editableFields, { merge: true });
          await localInvoke("markSynced", { table: "members", ids: [member.id] });
        }
        continue;
      }

      const gymRef = doc(db, "gyms", gymId);
      let assignedNo = member.member_no;
      await runTransaction(db, async (tx) => {
        const gymSnap = await tx.get(gymRef);
        if (!gymSnap.exists()) throw new Error("Gym not found");
        const nextSeq = (gymSnap.data().member_seq || 0) + 1;
        assignedNo = formatMemberNumber(gymPrefix, nextSeq);
        tx.update(gymRef, { member_seq: nextSeq });
        tx.set(memberRef, { ...prepareEntityDoc("members", member), member_no: assignedNo });
      });

      await localInvoke("applyMemberRenumber", { memberId: member.id, memberNo: assignedNo });
    } catch (err) {
      console.error("Sync push failed for a member (will retry next cycle):", err);
      failed += 1;
      errors.push(describeFailure("members", err));
    }
  }
  return failed;
}

/** Tombstoned local deletes (currently only custom_fields — the one hard
 *  DELETE in the local schema). deleteDoc on an already-gone/never-
 *  existed doc succeeds silently, so this is safe to retry indefinitely,
 *  including for a field created and deleted locally before ever syncing
 *  (a tombstone for an id Firestore never had — still a harmless no-op). */
async function pushDeletes(gymId, errors) {
  const items = await localInvoke("getPendingDeletes", { gymId });
  const cleared = [];
  let failed = 0;
  for (const item of items) {
    try {
      await deleteDoc(doc(db, item.table, item.id));
      cleared.push(item);
    } catch (err) {
      console.error(`Sync push: delete failed for ${item.table}/${item.id} (will retry next cycle):`, err);
      failed += 1;
      errors.push(describeFailure(`delete ${item.table}`, err));
    }
  }
  if (cleared.length > 0) await localInvoke("clearPendingDeletes", { items: cleared });
  return failed;
}

/**
 * Pushes everything locally-pending for `gymId` up to Firestore.
 *
 * Continues past per-record/per-chunk failures rather than throwing — one
 * rejected member must not stop a day of payments from reaching the cloud
 * — but it COUNTS them and returns `{ failedCount }`. That return value is
 * load-bearing: this used to swallow failures entirely, so a push that
 * Firestore rejected outright (a rules denial, say) still let the cycle
 * report "Synced successfully" while the record sat pending forever. A
 * sync that says it worked when it didn't is worse than one that says it
 * failed, because nobody goes looking. See auth.jsx's runSyncCycle.
 *
 * No-op outside Electron.
 */
export async function pushPendingChanges(gymId) {
  if (!window.gymOS?.isElectron || !gymId) return { failedCount: 0 };

  let failedCount = 0;
  const errors = [];
  try {
    const factRows = await localInvoke("getPendingFactRows", { gymId });
    for (const [table, rows] of Object.entries(factRows)) {
      if (rows?.length) failedCount += await pushFactTable(table, rows, errors);
    }

    const entityRows = await localInvoke("getPendingEntityRows", { gymId });
    for (const table of ["plans", "custom_fields", "users"]) {
      if (entityRows[table]?.length) failedCount += await pushEntityTable(table, entityRows[table], errors);
    }

    if (entityRows.members?.length) {
      const gymSnap = await getDoc(doc(db, "gyms", gymId));
      const gymPrefix = gymSnap.exists() ? gymSnap.data().prefix : null;
      if (gymPrefix) {
        failedCount += await pushMembers(gymId, entityRows.members, gymPrefix, errors);
      } else {
        // No prefix means the gym doc couldn't be read (offline, or a rules
        // denial). Members cannot be numbered without it, so they stay
        // pending — count them, or the cycle would call this a success
        // having pushed no members at all.
        failedCount += entityRows.members.length;
        errors.push("members: couldn't read the gym record (offline, or permission denied)");
      }
    }

    failedCount += await pushDeletes(gymId, errors);
  } catch (err) {
    console.error("Sync push cycle failed (will retry next cycle):", err);
    failedCount += 1;
    errors.push(describeFailure("sync", err));
  }

  // Deduplicated: one rules denial usually rejects every row in a table, and
  // repeating the same line per record buries the one fact that matters.
  return { failedCount, errors: [...new Set(errors)] };
}
