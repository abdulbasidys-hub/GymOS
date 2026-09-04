// One-time migration, not a build artifact — this is not imported by the
// app and ships nothing to the browser. Backfills every EXISTING owner
// (today: exactly one gym each) with the two fields the multi-branch
// feature needs (BUILD.md §6):
//   - gym_ids: [gym_id]        — so getOwnerForGym's array-contains query
//                                 finds them, and so they can be handed a
//                                 second branch later via addBranchToOwner.
//   - subscription: <copied>   — copied from their one gym's CURRENT
//                                 subscription (gyms/{id}.subscription),
//                                 which becomes a cache of this going
//                                 forward rather than its own source of
//                                 truth — see src/data/subscriptions.js.
//
// Must be run BEFORE (or together with) deploying the updated
// firestore.rules/getOwnerForGym — an owner doc still missing gym_ids
// simply won't be found by that query, not crash, but "invisible" until
// this has run. Safe to re-run: an owner who already has gym_ids is
// skipped, not overwritten. Delete this file once you've run it.
//
// Your admin credentials are never passed to or seen by anyone else: set
// them as env vars in YOUR OWN terminal right before running this.
//
//   SEED_ADMIN_USERNAME=<your admin username> SEED_ADMIN_PASSWORD=<your admin password> node scripts/migrate-multi-branch-owners.mjs
//
// (On Windows PowerShell:
//   $env:SEED_ADMIN_USERNAME="..."; $env:SEED_ADMIN_PASSWORD="..."; node scripts/migrate-multi-branch-owners.mjs
// )

import { readFileSync } from "node:fs";
import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";
import { getFirestore, doc, getDoc, updateDoc, collection, getDocs, query, where } from "firebase/firestore";

function loadEnv(path) {
  const out = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}

const env = loadEnv(new URL("../.env", import.meta.url));
const username = process.env.SEED_ADMIN_USERNAME;
const password = process.env.SEED_ADMIN_PASSWORD;

if (!username || !password) {
  console.error("Set SEED_ADMIN_USERNAME and SEED_ADMIN_PASSWORD in your shell first — see this file's own header comment.");
  process.exit(1);
}

const app = initializeApp({
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
});
const auth = getAuth(app);
const db = getFirestore(app);

const AUTH_EMAIL_DOMAIN = "gymos.app";
function usernameToEmail(u) {
  return `${String(u).trim().toLowerCase()}@${AUTH_EMAIL_DOMAIN}`;
}

async function main() {
  console.log(`Signing in as ${username}…`);
  await signInWithEmailAndPassword(auth, usernameToEmail(username), password);

  const snap = await getDocs(query(collection(db, "users"), where("role", "==", "owner")));
  console.log(`Found ${snap.docs.length} owner(s).`);

  let migrated = 0;
  let skipped = 0;
  for (const d of snap.docs) {
    const owner = { id: d.id, ...d.data() };
    if (owner.gym_ids?.length) {
      console.log(`  skip "${owner.name}" (${owner.id}) — already has gym_ids`);
      skipped++;
      continue;
    }
    if (!owner.gym_id) {
      console.log(`  skip "${owner.name}" (${owner.id}) — no gym_id at all`);
      skipped++;
      continue;
    }

    const gymSnap = await getDoc(doc(db, "gyms", owner.gym_id));
    const subscription = gymSnap.exists() ? gymSnap.data().subscription ?? {} : {};

    await updateDoc(doc(db, "users", owner.id), {
      gym_ids: [owner.gym_id],
      subscription,
    });
    console.log(`  migrated "${owner.name}" (${owner.id}) — gym_ids: [${owner.gym_id}]`);
    migrated++;
  }

  console.log(`Done — ${migrated} migrated, ${skipped} skipped.`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Failed:", err.message);
  process.exit(1);
});
