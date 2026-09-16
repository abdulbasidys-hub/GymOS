# GymOS

Gym management platform: search-and-verdict attendance (name/phone/member
number in, a clear go/no-go in under a second), flexible-duration membership
and equipment access tracked as two independent clocks, an owner dashboard,
an affiliate/marketer portal, and a super-admin console that runs many gyms
and their software subscriptions — plus a public marketing website. Ships
two ways: a web app and a native Windows desktop app (Electron) that keeps
working through outages.

## What's here

**Four apps on one backend, one login screen** — there's no self-serve
signup anywhere; every account (owner, receptionist, affiliate) is created
by someone else and handed a temporary password out of band:

- **Desk** (`/desk`) — receptionist: check-in, registration, payments, attendance.
- **Owner site** (`/owner`) — oversight + control of plans/staff/settings for one gym.
- **Affiliate/marketer portal** (`/affiliate`) — a referral partner's own view of
  the gyms they brought onto the platform and what they've earned from them.
- **Super-admin** (`/admin`) — the platform operator: creates gyms and owners,
  manages every gym's subscription and pricing tiers, manages marketers,
  watches sync health across the fleet.

Plus a **public marketing site** (`/`, `/product`, `/pricing`, `/contact`) —
the signed-out homepage on the web build. Electron skips it entirely: it's a
locally installed app for existing customers, so signed-out there goes
straight to login.

## Status

**Shipped — v1.0.0, live.** See `CHANGELOG.md` for what's in it and how
versions are numbered.

| Piece | Where it is |
|---|---|
| Web app | **https://gymos.africa** (Vercel) |
| Desktop app | [GitHub Release v1.0.0](https://github.com/abdulbasidys-hub/GymOS/releases/tag/v1.0.0) — `GymOS-Setup-1.0.0.exe` |
| Firestore + Storage rules | Deployed to `gymos-30db3` |
| `resetUserPassword` function | Deployed, `us-central1`, Node 22 |
| Owner / front-desk PDF guides | Built in `docs/` — **not yet published** on the super-admin Uploads page, so both roles still see "Not available yet" |

Both builds are complete, not stubs:

- **Web** — everyone reads/writes Firestore directly. This is the reference
  behavior; it's what "done" means for every feature in this app.
- **Electron (offline desktop)** — Desk and Owner run against local encrypted
  SQLite, syncing to Firestore (push and pull) once a connection exists, with
  a real offline license-expiry gate. Only native fingerprint hardware and a
  signed-license server remain deliberately deferred here.

**Deliberately not built:**
- Self-serve password recovery, or anything else that sends email — no email
  is ever sent by this app. A forgotten password is reset in person by
  whoever created the account (super admin for owners, owner for
  receptionists), which puts it back on the starter password and forces a
  new one at next sign-in.
- Auto-update for the desktop app — a new build is a new installer.
- Any self-serve signup. Every account is created by someone above it.

See `BUILD.md` for the full data model, every screen's behavior, and the
reasoning behind each decision — it's the actual spec, kept in sync with
the running code. `CHANGELOG.md` is what shipped and when;
`docs/RELEASING.md` is how to ship the next one. This file is just the map.

## Run

```bash
npm install
npm run dev          # web app, http://localhost:5173
```

Signed out, you'll land on the marketing homepage; `/login` signs in.

`.env` holds the Firebase config (copy `.env.example` to set up, then fill
in the values from the Firebase console — includes `VITE_FIREBASE_STORAGE_BUCKET`
now, for member photo uploads). On Vercel, add the same `VITE_FIREBASE_*`
variables as Environment Variables.

### Electron (offline desktop build)

```bash
npm run electron:dev     # Vite dev server + a native window, hot-reloading
npm run electron:build   # packaged Windows installer -> release/
```

## Architecture rules (do not break these)

- **`src/data/` is the only place that knows about storage.** Screens import
  from `src/data`, never from `firebase.js`, the Firebase SDK, or
  `window.gymOS` directly. This is the seam that lets Desk and Owner swap
  between Firestore (web) and local SQLite (Electron) without touching any
  screen — see `src/data/local/` and `electron/local-db/`.
- **The ledger is append-only for facts.** Payments, platform payments,
  attendance, membership/equipment records, and affiliate earnings are
  created once and never updated or deleted — enforced for real in
  `firestore.rules`, not just convention.
- **Security lives on the server.** The frontend is a display; every real
  permission is a Firestore or Storage rule. Never trust the browser.
- **Nothing is ever hard-deleted** — except one explicitly-flagged
  `TESTING ONLY` escape hatch (`src/data/dangerZone.js`) for wiping gyms
  created while building this. It goes away before any real gym signs up.

## Folder map

```
src/
├── data/         storage + auth seam — firebase init, ledger, one file per
│                 collection, local/ (Electron SQLite bridge + sync engine)
├── logic/        pure rules — expiry, entry verdict, revenue, license, timeseries
├── features/     screens — desk/ owner/ admin/ affiliate/ website/, + shared
│                 LoginPage/SetPasswordPage/MemberProfile
├── components/   shared UI — modal, verdict, history, plan picker, theme
│                 toggle, website/ (marketing-site-only pieces)
├── lib/          generic helpers — money/date formatting, countries, roles
├── auth.jsx      who's signed in + role/gym + route guard
└── theme.jsx     light/dark/system theme, persisted

electron/          native desktop wrapper — main process, preload, IPC;
                    local-db/ is every SQL statement in this app, and the
                    only place any of them live
firestore.rules     Firestore security rules — the real permission layer
storage.rules       Cloud Storage rules — member photo uploads
public/             static assets (logo, backgrounds, marketing screenshot)
```
