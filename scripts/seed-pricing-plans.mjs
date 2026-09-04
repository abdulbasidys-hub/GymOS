// One-time data entry, not a build artifact — this is not imported by the
// app and ships nothing to the browser. It performs the exact same
// Firestore write Settings.jsx's "Create a plan" form does
// (createPlatformPlan in src/data/platformPlans.js), just from a script
// instead of a browser, since driving a real browser isn't available in
// this environment. Delete this file once you've run it — it's a seed,
// not a feature.
//
// Your admin credentials are never passed to or seen by anyone else: set
// them as env vars in YOUR OWN terminal right before running this, so
// they're never written to a file or shared in chat.
//
//   SEED_ADMIN_USERNAME=<your admin username> SEED_ADMIN_PASSWORD=<your admin password> node scripts/seed-pricing-plans.mjs
//
// (On Windows PowerShell:
//   $env:SEED_ADMIN_USERNAME="..."; $env:SEED_ADMIN_PASSWORD="..."; node scripts/seed-pricing-plans.mjs
// )
//
// Reads Firebase project config from .env (same file Vite uses — these
// values are NOT secrets, see .env.example's own note) so nothing about
// your project needs to be typed twice.

import { readFileSync } from "node:fs";
import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";
import { getFirestore, doc, collection, setDoc, serverTimestamp } from "firebase/firestore";

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

// GymOS logs in with usernames, not raw emails — same mapping
// lib/helpers.js's usernameToEmail uses (kept in sync by hand since this
// script deliberately doesn't import the Vite app's own src/ modules).
const AUTH_EMAIL_DOMAIN = "gymos.app";
function usernameToEmail(u) {
  return `${String(u).trim().toLowerCase()}@${AUTH_EMAIL_DOMAIN}`;
}

// Straight from the pricing table you gave — see BUILD.md §6 for what
// every field means. max_branches/max_receptionists/max_members are for
// GymDetailPage.jsx/OwnerDetailPage.jsx's internal "over limit" pills only
// — the public Pricing page shows nothing but `features`, verbatim, so the
// exact wording you gave ("10+", "More than 3") is spelled out there
// directly instead of being guessed at from a bare number.
const PLANS = [
  {
    name: "Starter",
    amount: 5000,
    duration_days: 30,
    max_branches: 1,
    max_receptionists: 2,
    max_members: 300,
    blurb: "For a single gym location.",
    cta: "Get started",
    featured: false,
    features_intro: "",
    features: ["1 branch", "2 receptionists", "Up to 300 members", "1 owner account"],
  },
  {
    name: "Professional",
    amount: 10000,
    duration_days: 30,
    max_branches: 3,
    max_receptionists: 5,
    max_members: 2000,
    blurb: "For gyms running more than one location.",
    cta: "Get Professional",
    featured: true,
    features_intro: "Everything in Starter, plus:",
    features: [
      "Up to 3 branches", "5 receptionists", "Up to 2,000 members", "1 owner account",
      "Centralized multi-branch management", "Cross-branch reporting",
    ],
  },
  {
    name: "Ultimate",
    amount: 20000,
    duration_days: 30,
    max_branches: null,
    max_receptionists: null,
    max_members: null,
    blurb: "For multi-branch chains that have outgrown fixed limits.",
    cta: "Get Ultimate",
    featured: false,
    features_intro: "Everything in Professional, plus:",
    features: [
      "More than 3 branches", "10+ receptionists", "Unlimited members", "Multiple owner accounts",
      "Centralized multi-branch management", "Cross-branch reporting",
    ],
  },
];

async function main() {
  console.log(`Signing in as ${username}…`);
  const cred = await signInWithEmailAndPassword(auth, usernameToEmail(username), password);
  console.log(`Signed in as uid ${cred.user.uid}. Creating ${PLANS.length} plans…`);

  for (const plan of PLANS) {
    const ref = doc(collection(db, "platform_plans"));
    await setDoc(ref, {
      ...plan,
      id: ref.id,
      active: true,
      created_at: serverTimestamp(),
      actor_uid: cred.user.uid,
    });
    console.log(`  created "${plan.name}" (${ref.id})`);
  }

  console.log("Done — check Settings → Pricing plans in the super admin console.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Failed:", err.message);
  process.exit(1);
});
