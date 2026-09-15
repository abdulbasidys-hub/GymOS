// Captures the screenshots used in the PDF guides (docs/shots/).
//
// Drives headless Edge over the DevTools protocol using Node's built-in
// WebSocket -- no Playwright/Puppeteer dependency added to the project.
//
//   1. npm run dev -- --port 5199
//   2. node scripts/capture-screens.mjs --owner sbg-owner:PASSWORD \
//                                       --desk  sbg-reception:PASSWORD
//
// Signs in as each role in turn and walks that role's routes, writing one
// PNG per screen. Read-only: it never clicks a button that records a
// payment, an attendance or a member.

import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OUT = path.join(ROOT, "docs", "shots");
const BASE = process.env.GYMOS_BASE || "http://localhost:5199";
const PORT = 9333;

const EDGE = [
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
].find((p) => fs.existsSync(p));

if (!EDGE) {
  console.error("Microsoft Edge not found.");
  process.exit(1);
}

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : null;
}

const owner = (arg("owner") || "").split(":");
const desk = (arg("desk") || "").split(":");

if (!owner[0] || !owner[1] || !desk[0] || !desk[1]) {
  console.error("Usage: node scripts/capture-screens.mjs --owner user:pass --desk user:pass");
  process.exit(1);
}

// Desktop frame for most shots; the phone frame is used for the handful of
// screens the guides show on a phone.
const DESKTOP = { width: 1440, height: 900 };
const PHONE = { width: 414, height: 896 };

// [file name, route, settle ms, viewport]
const OWNER_SHOTS = [
  ["owner-dashboard", "/owner", 3500, DESKTOP],
  ["owner-members", "/owner/members", 3000, DESKTOP],
  ["owner-attendance", "/owner/attendance", 3000, DESKTOP],
  ["owner-finances", "/owner/finances", 3000, DESKTOP],
  ["owner-expiring", "/owner/expiring", 3000, DESKTOP],
  ["owner-team", "/owner/staff", 3000, DESKTOP],
  ["owner-settings", "/owner/settings", 3000, DESKTOP],
  ["owner-downloads", "/owner/downloads", 3000, DESKTOP],
  ["owner-dashboard-phone", "/owner", 3500, PHONE],
];

const DESK_SHOTS = [
  ["desk-checkin", "/desk", 3000, DESKTOP],
  ["desk-members", "/desk/members", 3000, DESKTOP],
  ["desk-register", "/desk/register", 3000, DESKTOP],
  ["desk-finances", "/desk/finances", 3000, DESKTOP],
  ["desk-settings", "/desk/settings", 3000, DESKTOP],
  ["desk-downloads", "/desk/downloads", 3000, DESKTOP],
  ["desk-checkin-phone", "/desk", 3000, PHONE],
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class CDP {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    ws.addEventListener("message", (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
      }
    });
  }

  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`${method} timed out`));
        }
      }, 45000);
    });
  }

  async eval(expression) {
    const r = await this.send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    return r.result?.value;
  }
}

async function connect() {
  for (let i = 0; i < 40; i++) {
    try {
      const list = await fetch(`http://127.0.0.1:${PORT}/json/list`).then((r) => r.json());
      const page = list.find((t) => t.type === "page");
      if (page?.webSocketDebuggerUrl) {
        const ws = new WebSocket(page.webSocketDebuggerUrl);
        await new Promise((res, rej) => {
          ws.addEventListener("open", res, { once: true });
          ws.addEventListener("error", rej, { once: true });
        });
        return new CDP(ws);
      }
    } catch {}
    await sleep(500);
  }
  throw new Error("Could not attach to Edge.");
}

async function setViewport(cdp, { width, height }) {
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 2,
    mobile: width < 600,
  });
}

async function goto(cdp, url, settle) {
  await cdp.send("Page.navigate", { url });
  await sleep(settle);
}

async function shot(cdp, name) {
  const { data } = await cdp.send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(path.join(OUT, `${name}.png`), Buffer.from(data, "base64"));
  console.log(`  ${name}.png`);
}

// Same as shot(), but reloads first if the screen is showing an error
// message. A screenshot with "Couldn't load…" in it is no use in a manual,
// and these are usually transient.
async function shotClean(cdp, name, url, settle) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    await goto(cdp, url, settle);
    // .form-error only -- .empty is legitimate content ("No payments yet."),
    // not a failure, and retrying on it would loop pointlessly.
    const problem = await cdp.eval(`(() => {
      const el = document.querySelector(".form-error");
      return el && el.offsetParent !== null ? el.textContent.trim() : "";
    })()`);
    if (!problem) break;
    if (attempt === 3) {
      console.log(`  (warning: ${name} still shows "${problem.slice(0, 60)}")`);
      break;
    }
    await sleep(1500);
  }
  await shot(cdp, name);
}

// Types into the login form through real input events -- React ignores a
// plain `input.value = ...` assignment, so the native value setter is used
// and an input event dispatched, which is what React's onChange listens for.
async function signIn(cdp, username, password) {
  await goto(cdp, `${BASE}/login`, 3000);
  const ok = await cdp.eval(`(() => {
    const set = (el, v) => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
      setter.call(el, v);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    };
    const form = document.querySelector("form.login__card");
    if (!form) return "no-form";
    const user = form.querySelector('input[autocomplete="username"]');
    const pass = form.querySelector('input[type="password"]');
    if (!user || !pass) return "no-fields";
    set(user, ${JSON.stringify(username)});
    set(pass, ${JSON.stringify(password)});
    form.querySelector('button[type="submit"]').click();
    return "submitted";
  })()`);
  if (ok !== "submitted") throw new Error(`Login form not found (${ok})`);

  for (let i = 0; i < 30; i++) {
    await sleep(1000);
    const state = await cdp.eval(`(() => {
      if (document.querySelector(".login__error")) return "error:" + document.querySelector(".login__error").textContent;
      if (location.pathname.startsWith("/owner") || location.pathname.startsWith("/desk")) return "in";
      if (document.body.innerText.includes("set your own password")) return "must-change-password";
      return "waiting";
    })()`);
    if (state === "in") return;
    if (state !== "waiting") throw new Error(state);
  }
  throw new Error("Sign-in did not complete");
}

// Asks the app's own data layer for a member to use in the profile
// screenshots, rather than hard-coding an id that would rot.
async function pickMember(cdp) {
  const raw = await cdp.eval(`(async () => {
    const fb = await import('/src/data/firebase.js');
    const data = await import('/src/data/index.js');
    const me = await data.getUserRecord(fb.auth.currentUser.uid);
    const members = await data.listMembers(me.gym_id);
    const sorted = [...members].sort((a, b) => a.name.localeCompare(b.name));
    // Prefer someone with no uploaded photo: the initial-letter avatar is
    // neutral in a printed guide, and the screen then shows "Add photo",
    // which is the more instructive of the two captions.
    const pick = sorted.find((m) => !m.photo_url) || sorted[0];
    return JSON.stringify(pick ? { id: pick.id, name: pick.name } : null);
  })()`);
  return raw ? JSON.parse(raw) : null;
}

// Opens a member by clicking their row in the list, the way a real user
// does -- rather than navigating straight to /…/member/<id>. A deep link
// starts the profile loading before the active gym is known, and that first
// failed attempt leaves a spurious "Couldn't load this member." on screen.
async function openMemberFromList(cdp, listUrl, memberName, settle) {
  await goto(cdp, listUrl, settle);
  const clicked = await cdp.eval(`(() => {
    const rows = [...document.querySelectorAll("tr.row--expandable")];
    const row = rows.find((r) => r.textContent.includes(${JSON.stringify(memberName)}));
    if (!row) return false;
    row.click();
    return true;
  })()`);
  if (!clicked) throw new Error(`Row for "${memberName}" not found in ${listUrl}`);
  await sleep(settle);
}

// Types into a live search box so the results table is on screen for the
// screenshot -- an empty search page teaches nothing. Uses the native value
// setter + input event because React ignores a plain value assignment.
async function typeInto(cdp, selector, text) {
  await cdp.eval(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return false;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    setter.call(el, ${JSON.stringify(text)});
    el.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  })()`);
  await sleep(1200);
}

async function signOut(cdp) {
  await cdp.eval(`(() => {
    const btn = document.querySelector(".sidebar__signout");
    if (btn) btn.click();
    return true;
  })()`);
  await sleep(2500);
}

async function run() {
  fs.mkdirSync(OUT, { recursive: true });

  const profile = path.join(process.env.TEMP || "/tmp", `gymos-shots-${Date.now()}`);
  const edge = spawn(EDGE, [
    "--headless=new",
    "--disable-gpu",
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`,
    "--window-size=1440,900",
    "about:blank",
  ]);
  edge.stderr.on("data", () => {});

  try {
    const cdp = await connect();
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");

    // Signed out, so this is the public sign-in screen.
    await setViewport(cdp, DESKTOP);
    await goto(cdp, `${BASE}/login`, 3500);
    await shot(cdp, "login");

    console.log(`Signing in as ${owner[0]} (owner)…`);
    await signIn(cdp, owner[0], owner[1]);
    for (const [name, route, settle, vp] of OWNER_SHOTS) {
      await setViewport(cdp, vp);
      await goto(cdp, `${BASE}${route}`, settle);
      await shot(cdp, name);
    }

    // The owner's read-only view of one member.
    await setViewport(cdp, DESKTOP);
    const ownerMember = await pickMember(cdp);
    if (ownerMember) {
      await openMemberFromList(cdp, `${BASE}/owner/members`, ownerMember.name, 4000);
      await shot(cdp, "owner-member-profile");
    } else {
      console.log("  (no member found — skipped owner-member-profile)");
    }

    await goto(cdp, `${BASE}/owner`, 2500);
    await signOut(cdp);

    console.log(`Signing in as ${desk[0]} (front desk)…`);
    await signIn(cdp, desk[0], desk[1]);
    for (const [name, route, settle, vp] of DESK_SHOTS) {
      await setViewport(cdp, vp);
      await goto(cdp, `${BASE}${route}`, settle);
      await shot(cdp, name);
    }

    await setViewport(cdp, DESKTOP);
    const deskMember = await pickMember(cdp);
    if (deskMember) {
      // Check-in mid-search, so the results table is visible.
      await goto(cdp, `${BASE}/desk`, 3000);
      await typeInto(cdp, ".search-stack input", deskMember.name.split(" ")[0]);
      await shot(cdp, "desk-checkin-results");

      // The desk's member profile: verdict banner, renew controls, the
      // Record attendance button. The most important screen in the guides.
      await openMemberFromList(cdp, `${BASE}/desk/members`, deskMember.name, 4000);
      await shot(cdp, "desk-member-profile");

      await setViewport(cdp, PHONE);
      await openMemberFromList(cdp, `${BASE}/desk/members`, deskMember.name, 4000);
      await shot(cdp, "desk-member-profile-phone");
    } else {
      console.log("  (no member found — skipped profile shots)");
    }

    console.log(`\nDone. ${fs.readdirSync(OUT).length} files in docs/shots/`);
  } finally {
    edge.kill();
    // Best-effort: Edge can still hold a file in the throwaway profile for a
    // moment after being killed, and a cleanup failure must not replace the
    // real error with a confusing EPERM.
    try {
      fs.rmSync(profile, { recursive: true, force: true });
    } catch {}
  }
}

run().catch((err) => {
  console.error("FAILED:", err.message);
  process.exit(1);
});
