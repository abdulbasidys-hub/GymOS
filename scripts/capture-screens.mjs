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

// Both credential pairs are optional, and so is doing the whole set.
// Needing every role's password to refresh any one screen is what stops a
// single stale shot from being fixed on its own.
//
//   --only pricing     just the pricing page (no sign-in at all)
//   --only desk        the front desk's screens
//   --only owner-team  one screen
const only = arg("only");
const wanted = (list) => (only ? list.filter(([name]) => name.includes(only)) : list);
const skipOwner = !owner[0] || !owner[1];
const skipDesk = !desk[0] || !desk[1];

// Desktop frame for most shots; the phone frame is used for the handful of
// screens the guides show on a phone.
const DESKTOP = { width: 1440, height: 900 };
const PHONE = { width: 414, height: 896 };

// Full page rather than a viewport crop: the whole document, header to
// footer, so nothing is cut off mid-card. 4x rather than the usual 2x because
// the result gets scaled down a long way when it lands in a PDF or a deck,
// and the pricing cards are mostly small text. Matches the framing of the
// hand-made docs/pricing-page.png this replaced.
const FULL_PAGE = { width: 1440, height: 900, deviceScaleFactor: 4, fullPage: true };

// Signed OUT — the public site. Captured before any sign-in.
const PUBLIC_SHOTS = [
  ["login", "/login", 5000, DESKTOP],
  ["pricing", "/pricing", 5000, FULL_PAGE],
];

// [file name, route, settle ms, viewport]
const OWNER_SHOTS = [
  ["owner-dashboard", "/owner", 5000, DESKTOP],
  ["owner-members", "/owner/members", 5000, DESKTOP],
  ["owner-attendance", "/owner/attendance", 5000, DESKTOP],
  ["owner-finances", "/owner/finances", 5000, DESKTOP],
  ["owner-expiring", "/owner/expiring", 5000, DESKTOP],
  ["owner-team", "/owner/staff", 5000, DESKTOP],
  ["owner-settings", "/owner/settings", 5000, DESKTOP],
  ["owner-downloads", "/owner/downloads", 5000, DESKTOP],
  ["owner-dashboard-phone", "/owner", 5000, PHONE],
  ["owner-team-phone", "/owner/staff", 5000, PHONE],
];

const DESK_SHOTS = [
  ["desk-checkin", "/desk", 5000, DESKTOP],
  ["desk-members", "/desk/members", 5000, DESKTOP],
  ["desk-register", "/desk/register", 5000, DESKTOP],
  ["desk-finances", "/desk/finances", 5000, DESKTOP],
  ["desk-settings", "/desk/settings", 5000, DESKTOP],
  ["desk-downloads", "/desk/downloads", 5000, DESKTOP],
  ["desk-checkin-phone", "/desk", 5000, PHONE],
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

async function setViewport(cdp, { width, height, deviceScaleFactor = 2 }) {
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor,
    mobile: width < 600,
  });
}

/** Grow the viewport to the document's own height so one capture holds the
 *  whole page. Done by re-applying the metrics override rather than with
 *  captureBeyondViewport, because the override is what the page's own media
 *  queries and sticky header react to — capturing "beyond" a short viewport
 *  leaves the sticky header painted part-way down the image. */
async function fitToPage(cdp, vp) {
  const height = await cdp.eval(`Math.ceil(Math.max(
    document.documentElement.scrollHeight,
    document.body ? document.body.scrollHeight : 0
  ))`);
  if (!height) return;
  await setViewport(cdp, { ...vp, height });
  // Let the resize settle: a layout this tall re-flows, and anything
  // positioned against the viewport moves.
  await sleep(900);
}

async function goto(cdp, url, settle) {
  await cdp.send("Page.navigate", { url });
  await sleep(settle);
}

// THE FIX for guides full of "Loading…".
//
// Every shot used to be a fixed sleep and a capture, which is a bet that the
// data came back inside N milliseconds. On a cold Firestore connection it
// routinely doesn't, and the bet was being lost silently — the PNG is only
// ever looked at weeks later, in a PDF.
//
// So: poll the rendered page until nothing on it still says "Loading…", and
// only then capture. A timeout still captures rather than aborting the whole
// run, but says so loudly, because a named-and-warned bad shot is worth more
// than a crashed run that produced nothing.
async function waitForLoaded(cdp, name, timeoutMs = 30000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const busy = await cdp.eval(`(() => {
      const text = document.body ? document.body.innerText : "";
      // Both spellings: JSX writes "Loading…" (U+2026) in most places and
      // "Loading&hellip;" in a few, which renders to the same character, but
      // the plain three dots turns up too.
      if (/Loading(…|\.\.\.)/.test(text)) return "loading";
      // The splash is the whole-app one, before auth resolves.
      if (document.querySelector(".splash")) return "splash";
      return "";
    })()`);
    if (!busy) return true;
    await sleep(500);
  }
  console.log(`  (warning: ${name} still showed a loading state after ${timeoutMs / 1000}s)`);
  return false;
}

async function shot(cdp, name) {
  const { data } = await cdp.send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(path.join(OUT, `${name}.png`), Buffer.from(data, "base64"));
  console.log(`  ${name}.png`);
}

// Same as shot(), but reloads first if the screen is showing an error
// message. A screenshot with "Couldn't load…" in it is no use in a manual,
// and these are usually transient.
// setViewport -> navigate -> settle -> WAIT FOR LOAD -> capture.
// Every screenshot goes through here, so none can quietly skip the wait,
// which is exactly how the old run() ended up full of "Loading…" (it had a
// retry helper, shotClean below, that it never actually called).
// A rendered screen, or a reason it isn't one. Returns "" when the page
// looks real.
//
// waitForLoaded alone is not enough, and this was found the hard way: a page
// that renders NOTHING contains no "Loading…" either, so it sails through
// that check and captures a pure white PNG. One shot (desk-finances) came
// back blank exactly this way while its neighbours were fine.
async function pageProblem(cdp) {
  return cdp.eval(`(() => {
    const text = document.body ? document.body.innerText.trim() : "";
    // The sidebar alone is ~40 characters, so anything under that is not a
    // screen — it is a blank or half-mounted document.
    if (text.length < 40) return "blank page (" + text.length + " chars)";
    const err = document.querySelector(".form-error");
    if (err && err.offsetParent !== null) return "error: " + err.textContent.trim().slice(0, 60);
    // Skeleton placeholders (the pricing page draws three grey cards while
    // plans load). These carry NO "Loading…" text, so waitForLoaded is blind
    // to them — the first capture of the pricing page came back as three grey
    // bars under a real headline, which passed every other check here.
    if (document.querySelector("[class*='skeleton']")) return "still showing skeleton placeholders";
    return "";
  })()`);
}

// setViewport -> navigate -> settle -> WAIT FOR LOAD -> check it rendered ->
// capture. Every screenshot goes through here, so none can quietly skip the
// wait, which is exactly how the old run() ended up full of "Loading…" (it
// had a retry helper, shotClean below, that it never actually called).
//
// Retries the whole navigation rather than just waiting longer: a blank or
// errored screen is usually a load that went wrong, and waiting on a broken
// render never fixes it.
async function capture(cdp, name, route, settle, vp) {
  let problem = "";
  for (let attempt = 1; attempt <= 3; attempt++) {
    await setViewport(cdp, vp);
    await goto(cdp, `${BASE}${route}`, settle);
    await waitForLoaded(cdp, name);
    // A beat after the data lands, so charts and images have painted.
    await sleep(1200);
    problem = await pageProblem(cdp);
    // Only once the content is real — measuring a skeleton or a blank
    // document would size the image to the wrong page.
    if (!problem && vp.fullPage) await fitToPage(cdp, vp);
    if (!problem) break;
    if (attempt < 3) {
      console.log(`  (retrying ${name}: ${problem})`);
      await sleep(2000);
    }
  }
  if (problem) console.log(`  (WARNING: ${name} captured anyway — ${problem})`);
  await shot(cdp, name);
}

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
  // Poll for the row rather than trusting one fixed wait: the list is
  // fetched after the route renders, and a slow fetch used to make this
  // fail outright.
  for (let i = 0; i < 20; i++) {
    const ready = await cdp.eval(
      `document.querySelectorAll("tr.row--expandable").length > 0`
    );
    if (ready) break;
    await sleep(700);
  }
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

    // Signed out: the public pages.
    for (const [name, route, settle, vp] of wanted(PUBLIC_SHOTS)) {
      await capture(cdp, name, route, settle, vp);
    }

    const ownerWanted = wanted(OWNER_SHOTS);
    const deskWanted = wanted(DESK_SHOTS);

    if (skipOwner || ownerWanted.length === 0) {
      if (ownerWanted.length > 0) console.log("No --owner credentials — owner shots skipped.");
    } else {
      console.log(`Signing in as ${owner[0]} (owner)…`);
      await signIn(cdp, owner[0], owner[1]);
      for (const [name, route, settle, vp] of ownerWanted) {
        await capture(cdp, name, route, settle, vp);
      }

      // The one-off owner screens below aren't in OWNER_SHOTS (they need a
      // click or a lookup first), so a filtered run skips them rather than
      // silently recapturing screens nobody asked for.
      if (!only) {

    // The phone's overflow menu, open. Only meaningful at phone width --
    // the burger doesn't exist in the desktop sidebar.
    await setViewport(cdp, PHONE);
    await goto(cdp, `${BASE}/owner`, 5000);
    await waitForLoaded(cdp, "owner-more-phone");
    const opened = await cdp.eval(`(() => {
      const b = document.querySelector(".nav-more");
      if (!b) return false;
      b.click();
      return true;
    })()`);
    if (opened) {
      await sleep(900);
      await shot(cdp, "owner-more-phone");
    } else {
      console.log("  (burger not found — skipped owner-more-phone)");
    }

    // The owner's read-only view of one member.
    await setViewport(cdp, DESKTOP);
    const ownerMember = await pickMember(cdp);
    if (ownerMember) {
      await openMemberFromList(cdp, `${BASE}/owner/members`, ownerMember.name, 5000);
      await waitForLoaded(cdp, "owner-member-profile");
      await sleep(1200);
      await shot(cdp, "owner-member-profile");
    } else {
      console.log("  (no member found — skipped owner-member-profile)");
    }

      await goto(cdp, `${BASE}/owner`, 2500);
      await signOut(cdp);
      }
    }

    if (skipDesk || deskWanted.length === 0) {
      if (deskWanted.length > 0) console.log("No --desk credentials given — desk shots skipped.");
      console.log(`Done. ${fs.readdirSync(OUT).length} files in docs/shots/`);
      return;
    }

    console.log(`Signing in as ${desk[0]} (front desk)…`);
    await signIn(cdp, desk[0], desk[1]);
    for (const [name, route, settle, vp] of deskWanted) {
      await capture(cdp, name, route, settle, vp);
    }

    await setViewport(cdp, DESKTOP);
    const deskMember = only ? null : await pickMember(cdp);
    if (deskMember) {
      // Check-in mid-search, so the results table is visible.
      await goto(cdp, `${BASE}/desk`, 5000);
      await waitForLoaded(cdp, "desk-checkin-results");
      await typeInto(cdp, ".search-stack input", deskMember.name.split(" ")[0]);
      await sleep(1200);
      await shot(cdp, "desk-checkin-results");

      // The desk's member profile: verdict banner, renew controls, the
      // Record attendance button. The most important screen in the guides.
      await openMemberFromList(cdp, `${BASE}/desk/members`, deskMember.name, 5000);
      await waitForLoaded(cdp, "desk-member-profile");
      await sleep(1200);
      await shot(cdp, "desk-member-profile");

      await setViewport(cdp, PHONE);
      await openMemberFromList(cdp, `${BASE}/desk/members`, deskMember.name, 5000);
      await waitForLoaded(cdp, "desk-member-profile-phone");
      await sleep(1200);
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
