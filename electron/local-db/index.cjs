// The full local-db operation surface — one flat dispatch map from
// operation name (what the renderer's localInvoke() calls) to the
// function that runs it against the open connection. This is the "one
// generic invoke()" side of the IPC design in BUILD.md §15: registering a
// new operation is one new entry here, not a matching pair of new
// preload/main wiring.

const fs = require("node:fs");
const path = require("node:path");
const ledger = require("./ledger.cjs");
const members = require("./members.cjs");
const memberPhotos = require("./memberPhotos.cjs");
const payments = require("./payments.cjs");
const membershipRecords = require("./membershipRecords.cjs");
const equipmentRecords = require("./equipmentRecords.cjs");
const attendance = require("./attendance.cjs");
const activityLog = require("./activityLog.cjs");
const plans = require("./plans.cjs");
const customFields = require("./customFields.cjs");
const users = require("./users.cjs");
const gyms = require("./gyms.cjs");
const { bootstrapImport } = require("./bootstrap.cjs");
const { emitUserChanged, emitGymChanged, emitLocalSessionChanged } = require("./watchers.cjs");
const sync = require("./sync.cjs");
const pull = require("./pull.cjs");
const syncMeta = require("./syncMeta.cjs");
const credentials = require("./credentials.cjs");
const session = require("./session.cjs");

/**
 * Builds the operation map bound to a specific open `db` connection.
 * Kept as a function (not a module-level object) so it never captures a
 * stale connection reference — connection.cjs's getConnection() is the
 * single source of truth for "the" db, called fresh by main.cjs's
 * ipcMain.handle wiring each time.
 */
// A plain-text sync log next to the local database, so a failure on a
// customer's machine can be READ rather than described down a phone line.
// The packaged app has no menu and no DevTools; a console.error there
// reaches nobody. Appends, capped, and never throws — a logging failure
// must not become the error it was trying to record.
function appendSyncLog(userDataPath, { line }) {
  try {
    const file = path.join(userDataPath, "sync-errors.log");
    let existing = "";
    try { existing = fs.readFileSync(file, "utf8"); } catch {}
    // Keep the tail only — this is a diagnostic, not an audit trail.
    if (existing.length > 200000) existing = existing.slice(-100000);
    fs.writeFileSync(file, `${existing}${new Date().toISOString()}  ${line}
`, "utf8");
  } catch {}
  return { ok: true };
}

function buildOperations(db, { userDataPath } = {}) {
  return {
    appendSyncLog: (args) => appendSyncLog(userDataPath, args),
    ping: () => "pong",

    appendRecord: (args) => ledger.appendRecord(db, args),
    appendAdjustment: (args) => ledger.appendAdjustment(db, args),

    createMember: (args) => members.createMember(db, args),
    getMember: (args) => members.getMember(db, args),
    listMembers: (args) => members.listMembers(db, args),
    updateMember: (args) => members.updateMember(db, args),
    setMemberPhotoUrl: (args) => members.setMemberPhotoUrl(db, args),
    getMemberPhoto: (args) => memberPhotos.getMemberPhoto(db, args),
    listCachedPhotoUrls: (args) => memberPhotos.listCachedPhotoUrls(db, args),
    cacheMemberPhoto: (args) => memberPhotos.cacheMemberPhoto(db, args),
    putMemberPhoto: (args) => memberPhotos.putMemberPhoto(db, args),
    getPhotoCacheSize: (args) => memberPhotos.getPhotoCacheSize(db, args),

    listPaymentsByGym: (args) => payments.listPaymentsByGym(db, args),
    listPaymentsByMember: (args) => payments.listPaymentsByMember(db, args),

    listMembershipRecords: (args) => membershipRecords.listMembershipRecords(db, args),
    listMembershipRecordsByGym: (args) => membershipRecords.listMembershipRecordsByGym(db, args),

    listEquipmentRecords: (args) => equipmentRecords.listEquipmentRecords(db, args),
    listEquipmentRecordsByGym: (args) => equipmentRecords.listEquipmentRecordsByGym(db, args),

    listAttendanceByGym: (args) => attendance.listAttendanceByGym(db, args),
    listAttendanceByMember: (args) => attendance.listAttendanceByMember(db, args),

    listActivityByGym: (args) => activityLog.listActivityByGym(db, args),

    createPlan: (args) => plans.createPlan(db, args),
    listPlans: (args) => plans.listPlans(db, args),
    updatePlan: (args) => plans.updatePlan(db, args),
    retirePlan: (args) => plans.retirePlan(db, args),
    reactivatePlan: (args) => plans.reactivatePlan(db, args),

    createCustomField: (args) => customFields.createCustomField(db, args),
    listCustomFields: (args) => customFields.listCustomFields(db, args),
    updateCustomField: (args) => customFields.updateCustomField(db, args),
    retireCustomField: (args) => customFields.retireCustomField(db, args),
    reactivateCustomField: (args) => customFields.reactivateCustomField(db, args),
    deleteCustomField: (args) => customFields.deleteCustomField(db, args),

    getUserRecord: (args) => users.getUserRecord(db, args),
    listStaff: (args) => users.listStaff(db, args),
    // These three touch a row watchUser() (watchers.cjs) may have a live
    // subscriber on — re-emit after the write so an already-open session
    // reflects the change immediately, matching onSnapshot's own behavior.
    setUserActive: (args) => { users.setUserActive(db, args); emitUserChanged(db, args.uid); },
    setUserPhone: (args) => { users.setUserPhone(db, args); emitUserChanged(db, args.uid); },
    setUserEmail: (args) => { users.setUserEmail(db, args); emitUserChanged(db, args.uid); },
    // Mirrors an ONLINE Firestore write already made (accounts.js's
    // changeOwnPassword) — see users.cjs's own comment on why this one
    // exists and stays 'synced' rather than 'pending'.
    clearMustChangePassword: (args) => { users.clearMustChangePassword(db, args); emitUserChanged(db, args.uid); },

    getGym: (args) => gyms.getGym(db, args),
    // Same reasoning as setUserActive/etc. above, for watchGymRecord().
    updateGymName: (args) => { gyms.updateGymName(db, args); emitGymChanged(db, args.gymId); },

    bootstrapImport: (args) => bootstrapImport(db, args),

    // Phase 3, push side (BUILD.md §15) — src/data/local/sync.js's IPC
    // surface.
    getPendingFactRows: (args) => sync.getPendingFactRows(db, args),
    getPendingEntityRows: (args) => sync.getPendingEntityRows(db, args),
    getPendingDeletes: (args) => sync.getPendingDeletes(db, args),
    getPendingCount: (args) => sync.getPendingCount(db, args),
    markSynced: (args) => sync.markSynced(db, args),
    clearPendingDeletes: (args) => sync.clearPendingDeletes(db, args),
    applyMemberRenumber: (args) => sync.applyMemberRenumber(db, args),

    // Phase 3, pull side, Milestone 1 (BUILD.md §15) — entity refetch.
    applyPulledGym: (args) => pull.applyPulledGym(db, args),
    applyPulledUsers: (args) => pull.applyPulledUsers(db, args),
    applyPulledPlans: (args) => pull.applyPulledPlans(db, args),
    applyPulledCustomFields: (args) => pull.applyPulledCustomFields(db, args),

    // Phase 3, pull side, Milestone 2 (BUILD.md §15) — cursor-based
    // FACT/member pull, and the sync_meta-backed cursor storage it needs.
    getPullCursors: (args) => syncMeta.getPullCursors(db, args),
    setPullCursor: (args) => syncMeta.setPullCursor(db, args),
    applyPulledFactPage: (args) => pull.applyPulledFactPage(db, args),
    applyPulledMembersPage: (args) => pull.applyPulledMembersPage(db, args),

    // Phase 4 (BUILD.md §13/§15) — offline license enforcement's
    // forward-only clock anchor, same sync_meta table.
    advanceForwardClock: (args) => syncMeta.advanceForwardClock(db, args),

    // Offline authentication (BUILD.md §15) — src/data/accounts.js's IPC
    // surface. captureCredential/verifyCredential never touch
    // local_session themselves (credentials.cjs has no watchers.cjs
    // dependency, on purpose); the renderer calls setLocalSession
    // separately once either path confirms who's signing in.
    captureCredential: (args) => credentials.captureCredential(db, args),
    verifyCredential: (args) => credentials.verifyCredential(db, args),

    getLocalSession: () => session.getLocalSession(db),
    setLocalSession: (args) => { session.setLocalSession(db, args); emitLocalSessionChanged(db); },
    clearLocalSession: () => { session.clearLocalSession(db); emitLocalSessionChanged(db); },
    // Idle-timeout bookkeeping only (useIdleTimeout.js) — deliberately
    // does NOT emit; nothing renders off last_activity_at directly, and
    // this fires on every mouse move debounce tick, far too often to
    // treat as a real session-changed event.
    touchLocalSessionActivity: (args) => session.touchLocalSessionActivity(db, args),
  };
}

module.exports = { buildOperations };
