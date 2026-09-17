// Repairs owner accounts whose `gym_ids` array doesn't contain their own
// `gym_id`.
//
// Why this can happen: addBranchToOwner used to call arrayUnion(newGymId)
// on a field that, for an owner created before `gym_ids` existed, wasn't
// there yet. arrayUnion CREATES a missing field containing only what you
// pass — so adding a second branch replaced the owner's list with just the
// new branch and dropped the gym they were already running. Deleting a
// branch could also leave a dangling id behind.
//
// Why it matters: firestore.rules resolves what an owner may touch from
// `gym_ids` whenever that field exists. An owner missing their own gym from
// it is denied every read and write for that gym, while the app still points
// its screens at `gym_id` — so the app asks for one gym and the server
// authorises another. The symptom is a blank dashboard and "permission
// denied" everywhere, with nothing on screen to explain it.
//
// Both causes are fixed going forward (src/data/users.js, src/data/dangerZone.js,
// and myGymIds() in firestore.rules now always includes the scalar gym_id as
// a safety net). This script cleans up accounts that were already damaged.
//
// Runs against the live project as YOUR super-admin login. It is read-only
// unless --fix is passed, so run it once to see the damage first:
//
//   SEED_ADMIN_USERNAME=<admin username> SEED_ADMIN_PASSWORD=<password> \
//     node scripts/repair-owner-gym-ids.mjs
//
//   ...then, to actually write:
//
//   SEED_ADMIN_USERNAME=... SEED_ADMIN_PASSWORD=... \
//     node scripts/repair-owner-gym-ids.mjs --fix
//
// Your credentials are never stored or sent anywhere but Firebase Auth.

import { readFileSync } from "node:fs";
import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";
import {
  getFirestore, collection, query, where, getDocs, doc, getDoc, updateDoc,
} from "firebase/firestore";

const FIX = process.argv.includes("--fix");
const username = process.env.SEED_ADMIN_USERNAME;
const password = process.env.SEED_ADMIN_PASSWORD;

if (!username || !password) {
  console.error("Set SEED_ADMIN_USERNAME and SEED_ADMIN_PASSWORD. See the header of this file.");
  process.exit(1);
}

// Same values the app uses; read straight from .env so there is one source.
const env = Object.fromEntries(
  readFileSync(new URL("../.env", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    })
);

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

await signInWithEmailAndPassword(auth, `${username.toLowerCase()}@gymos.app`, password);
console.log(`Signed in as ${username}.${FIX ? "" : "  (dry run — pass --fix to write)"}\n`);

const owners = await getDocs(query(collection(db, "users"), where("role", "==", "owner")));
console.log(`${owners.size} owner account(s).\n`);

let broken = 0;
let dangling = 0;
let fixed = 0;

for (const d of owners.docs) {
  const o = { id: d.id, ...d.data() };
  const list = Array.isArray(o.gym_ids) ? o.gym_ids : null;

  // No array at all is FINE — the rules fall back to the scalar gym_id.
  if (!list) continue;

  const problems = [];
  let next = [...list];

  if (o.gym_id && !list.includes(o.gym_id)) {
    problems.push(`missing own gym_id (${o.gym_id})`);
    next = [o.gym_id, ...next];
    broken++;
  }

  // Ids pointing at gyms that no longer exist.
  const missing = [];
  for (const gid of list) {
    const g = await getDoc(doc(db, "gyms", gid));
    if (!g.exists()) missing.push(gid);
  }
  if (missing.length) {
    problems.push(`points at ${missing.length} deleted gym(s): ${missing.join(", ")}`);
    next = next.filter((g) => !missing.includes(g));
    dangling++;
  }

  if (problems.length === 0) continue;

  console.log(`${o.username || o.name || o.id}`);
  console.log(`   gym_id : ${o.gym_id}`);
  console.log(`   gym_ids: [${list.join(", ")}]`);
  for (const p of problems) console.log(`   -> ${p}`);
  console.log(`   would become: [${next.join(", ")}]`);

  if (FIX) {
    await updateDoc(doc(db, "users", o.id), { gym_ids: next });
    console.log("   FIXED");
    fixed++;
  }
  console.log("");
}

console.log("---");
console.log(`missing own gym: ${broken}`);
console.log(`dangling ids   : ${dangling}`);
console.log(FIX ? `repaired       : ${fixed}` : "dry run — nothing written. Re-run with --fix.");
process.exit(0);
