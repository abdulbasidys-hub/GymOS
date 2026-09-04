// Local mirror of the Desk/Owner-relevant parts of src/data/gyms.js
// (getGym, watchGym, updateGymName). Everything else in that file —
// createGym, listGyms, listGymsByAffiliate, suspendGym, reactivateGym,
// setSubscription, lockSubscription, unlockSubscription — is admin-only
// and has no local counterpart (BUILD.md §15 decision #3).
//
// Firestore stores `subscription` as a nested map; SQLite has no nested-
// object type, so the schema flattens it into subscription_* columns.
// rowToGym re-nests them on the way out so logic/license.js and every
// other consumer keeps reading gym.subscription.expiry_date exactly like
// it does against the Firestore shape today.

function rowToGym(row) {
  if (!row) return null;
  const {
    subscription_activated_at, subscription_expiry_date, subscription_grace_hours,
    subscription_last_verified_at, subscription_locked, subscription_plan_id, subscription_plan_name,
    ...rest
  } = row;
  return {
    ...rest,
    subscription: {
      activated_at: subscription_activated_at,
      expiry_date: subscription_expiry_date,
      grace_hours: subscription_grace_hours,
      last_verified_at: subscription_last_verified_at,
      locked: !!subscription_locked,
      plan_id: subscription_plan_id,
      plan_name: subscription_plan_name,
    },
  };
}

function getGym(db, { gymId }) {
  return rowToGym(db.prepare("SELECT * FROM gyms WHERE id = ?").get(gymId));
}

// sync_status='pending' for consistency with every other local UPDATE
// (BUILD.md §15, Phase 3) — currently unreachable from Electron (its only
// caller is Admin's GymDetailPage.jsx, and Admin never runs in Electron),
// but there's no reason for this one function to be the odd one out if
// that ever changes.
function updateGymName(db, { gymId, name }) {
  db.prepare("UPDATE gyms SET name = ?, sync_status = 'pending' WHERE id = ?").run(String(name).trim(), gymId);
}

module.exports = { getGym, updateGymName, rowToGym };
