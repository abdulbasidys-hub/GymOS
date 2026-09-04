# GymOS — Build Brief

This is the authoritative spec for GymOS, kept in sync with what's actually
built. Every decision here is settled — implement it, don't redesign it.
Where this document and your instincts conflict, this document wins. Where
this document and the running code conflict, treat that as a bug in the
document and fix the doc to match the code (or flag it) rather than assuming
the code is wrong.

---

## 1. What GymOS is

A gym-management platform. Biometric/QR attendance, annual membership +
flexible equipment access, an owner oversight site, an affiliate-marketer
portal, and a super-admin console that runs many gyms and their software
subscriptions.

**Four apps on one backend, one login screen:**
- **Desk** (`/desk`) — receptionist: check-in, registration, payments, attendance.
- **Owner site** (`/owner`) — oversight + control of plans/staff/settings for one gym.
- **Affiliate/Marketer portal** (`/affiliate`) — a referral partner's own view of
  the gyms they brought onto the platform and what they've earned from them.
- **Super-admin** (`/admin`) — the platform operator: creates gyms and owners,
  manages every gym's subscription, manages marketers and platform pricing,
  watches sync health across the fleet.

"Cloud sync" is not a fifth app — it's the backend the four share. There is
no separate registration/signup flow anywhere: every account (owner,
receptionist, affiliate) is created BY someone else (super-admin or an
owner) and handed a temporary password out of band.

---

## 2. Architecture guardrails (DO NOT BREAK)

1. **`src/data/` is the only place that knows about storage.** Screens import
   from `src/data` (via `index.js`), never from `firebase.js` or the Firebase
   SDK directly. This is the seam that lets Desk and Owner swap to local
   SQLite inside Electron (§15 — done) without touching any screen. **Auth
   calls also go through the seam** (`src/data/accounts.js`).
2. **The ledger is append-only for FACTS.** Payments, platform payments,
   attendance, membership records, equipment-access records, affiliate
   earnings, and adjustments are created once and never updated or deleted by
   anyone, including super-admin — with one narrow, deliberate exception:
   `affiliate_earnings.status` flips `"pending" → "paid"` once a payout run is
   actually sent (see §6). Everything else follows the append-only rule for
   real, enforced in `firestore.rules`.
3. **Mutable entities are normal docs.** Gyms, users, members, plans, platform
   plans, and custom fields CAN be updated (rename, retire, edit). They don't
   go through the append-only ledger.
4. **Security lives on the server.** The frontend is a display. Every real
   permission is a Firestore rule. Never trust the browser. Role-based routing
   is UX convenience only.
5. **Web phase is entirely online.** Everyone reads/writes Firestore directly,
   through the seam — true on the web build regardless of what's built
   inside Electron. Local SQLite (Desk/Owner, inside Electron) is built
   (§15) but the **sync engine** — pushing local writes back up to
   Firestore — is not: local writes stay local-only until then. Do not
   build sync logic into screens. This applies to Desk and Owner only — Admin (super-admin)
   and Affiliate are permanently web-only, since neither has an operational
   reason to work from one gym's local cache (Admin spans every gym;
   Affiliate only ever views referrals/earnings).
6. **Nothing is ever hard-deleted — with one temporary, explicitly-flagged
   exception.** `src/data/dangerZone.js` (`deleteGymAndAllData`) and its
   matching `// TESTING ONLY` `allow delete` grants in `firestore.rules` exist
   solely to wipe test gyms created while building GymOS. Once real paying
   gyms exist: delete that file, its call site (`admin/GymDetailPage.jsx`'s
   "Danger zone" card), and every rule tagged `TESTING ONLY`.
7. **Surgical edits.** Change only what a task needs. Deliver complete files.

---

## 3. Firestore gotchas (these have bitten us before)

- Run every write object through `stripUndefined()` — Firestore rejects
  `undefined` field values with `invalid-argument`.
- Avoid `where` + `orderBy` on different fields (composite-index errors). Use a
  single-field `orderBy`, or fetch and sort in JS.
- In the **client** SDK, `snapshot.exists()` is a METHOD (call with parens).
- Increment `member_seq` inside a **transaction** so two registrations can't
  collide on the same member number.
- `get()`/`exists()` inside security rules bypass collection read rules, so
  `isSuperAdmin()`-style helpers always work — and a rule can safely reach
  across collections (e.g. `gymAffiliateId(gymId)` reads the gym doc to decide
  whether an affiliate may read a `users/{uid}` doc). Each cross-doc `get()`
  inside a rule counts as an extra document read against quota, so keep them
  to one or two per rule, not chained deeply.
- A security-rules change (`firestore.rules`) only takes effect once it's
  **published** — pasted into the Firebase Console's Firestore → Rules tab (or
  pushed via `firebase deploy --only firestore:rules` once the project has a
  `firebase.json`/CLI project set up, which it does not yet). Editing the file
  in the repo does nothing to the live database by itself; forgetting this
  step looks exactly like a missing permission and is easy to misdiagnose as
  a code bug.

---

## 4. Tech stack

React + Vite, `react-router-dom` v6, Firebase (Auth + Firestore), no UI/chart
library — every chart, modal, popover, and icon is hand-rolled in
`src/components/`. Vite `base: "./"` (for Electron later). Auth is
**Email/Password only**; usernames map to an internal email domain (see §7).
No emails are ever SENT (no verification/reset) — nothing depends on the
retired Firebase Dynamic Links. Owner/receptionist/affiliate accounts now
capture a real contact **email** as a plain data field (see §6), but nothing
reads or sends to it yet; it's there for a future notification feature.

No git repository is initialized for this project as of this writing.

---

## 5. Folder layout (current)

```
src/
├── data/           storage + auth seam — the ONLY files that import the Firebase SDK
│   ├── firebase.js         init from .env (VITE_FIREBASE_*)
│   ├── ledger.js           appendRecord / appendAdjustment (append-only facts)
│   ├── accounts.js         auth session: watchAuth, signInWithUsername, signOutUser,
│   │                       getUserRecord/watchUserRecord, changeOwnPassword, changePassword
│   ├── gyms.js             gyms collection + subscription lifecycle
│   ├── users.js            owners/receptionists/affiliates: create, list, phone/email/
│   │                       address, activate/deactivate, affiliate bank details
│   ├── members.js          member registration (transactional member_seq) + search
│   ├── plans.js            a GYM's own membership/equipment plans
│   ├── customFields.js     a gym's extra registration questions
│   ├── payments.js         a gym's payments FROM its members (frozen amount)
│   ├── attendance.js       check-in events
│   ├── membershipRecords.js / equipmentRecords.js
│   ├── activityLog.js      a gym's own staff activity feed
│   ├── platformPlans.js    super-admin's pricing tiers for what GYMS pay the PLATFORM
│   ├── platformPayments.js a gym's payments TO the platform (frozen amount)
│   ├── platformSettings.js single "config" doc — currently just affiliate commission %
│   ├── affiliateEarnings.js commission an affiliate earns on a gym's platform payment
│   ├── adminActivityLog.js platform-level audit trail (gym created/suspended/subscription changes)
│   ├── dangerZone.js       TESTING ONLY — see §2.6
│   ├── local/              Electron/offline (§15) — renderer side, no SQL
│   │   ├── bridge.js           localInvoke() — every branched *.js function's Electron path
│   │   ├── bootstrap.js        ensureBootstrapped() — one-time Firestore -> SQLite seed
│   │   └── sync.js             pushPendingChanges() — push-side sync engine (pull not built yet)
│   └── index.js            the single interface everything imports from
├── logic/          pure rules — no UI, no storage (easy to test)
│   ├── expiry.js           duration math + isActive / currentRecord / expiringSoon
│   ├── entry.js            allow/block verdict (membership AND equipment)
│   ├── revenue.js          sum + filter frozen payment amounts over a range
│   ├── memberNumber.js     PREFIX-#### formatting
│   ├── license.js          last-expiry + 24h grace + forward-only clock
│   ├── timeseries.js       daily-bucketing for trend charts
│   └── gymHealth.js        shared "is this gym okay" math (dashboard/sync monitor/attention)
├── auth.jsx        AuthProvider + useAuth (role/gym), live-subscribed to your own user doc
├── theme.jsx       ThemeProvider + useTheme — light/dark/system, persisted, data-theme attr
├── lib/
│   ├── helpers.js          stripUndefined, naira, formatMoney, toDate/formatDate/formatDateTime,
│   │                       startOfDay, usernameToEmail, AUTH_EMAIL_DOMAIN, DEFAULT_PASSWORD, capitalize
│   ├── countries.js        every ISO 3166-1 country + its ISO 4217 currency — COUNTRIES,
│   │                       countryByCode, searchCountries (CountryPicker.jsx's data)
│   └── roles.js            homePathFor(role)
├── features/
│   ├── LoginPage.jsx       the homepage when signed out — split-panel design, username+password
│   ├── SetPasswordPage.jsx forced first-login password change (must_change_password)
│   ├── MemberProfile.jsx   SHARED between desk and owner (role-conditional inside)
│   ├── desk/               DeskHome (shell), CheckIn, DeskMembers, DeskFinances, RegisterMember
│   ├── owner/               OwnerDashboard (shell), OwnerHome, MembersList, Attendance,
│   │                       Finances, ManageStaff, StaffProfile, ExpiringSoon, GymSettings
│   ├── admin/               AdminDashboard (shell), Dashboard, GymsList, GymDetailPage,
│   │                       SubscriptionModal, NewGym, Subscriptions, Revenue, MarketersList,
│   │                       MarketersRevenue, AffiliateDetailPage, SyncMonitor, AttentionPage,
│   │                       Settings
│   └── affiliate/           AffiliateHome (shell), AffiliateGyms, AffiliateRevenue
└── components/     shared UI — see §9 for the interaction patterns these encode
    Logo, StatusBadge, PhoneNumber, EntryVerdict, HistoryList, PlanPicker,
    ExpandableRow, ExpandableActivity, TrendChart, Modal, ChangePasswordForm,
    SearchToggle, FilterMenu, ThemeToggle, ThemePreference, LockedScreen,
    CountryPicker
firestore.rules    the real security layer (root)
electron/          native desktop wrapper — see §15. Tracked in version
                    control (only electron-builder's packaged output,
                    release/, is git-ignored)
    ├── main.cjs        BrowserWindow + registers the local-db IPC surface
    │                   (loads dist/index.html packaged, Vite dev server
    │                   under electron:dev)
    ├── preload.cjs     contextBridge: window.gymOS.isElectron +
    │                   window.gymOS.db (invoke/onUserRecordChange/onGymChange)
    └── local-db/       main-process-only — all SQL lives here, never in src/
        ├── connection.cjs   opens the encrypted db, runs migrations
        ├── key.cjs           safeStorage-wrapped SQLCipher key (§15.3)
        ├── schema.cjs        CREATE TABLE + user_version migration runner
        ├── helpers.cjs       newId/nowIso/boolean-column helpers
        ├── ledger.cjs        local appendRecord/appendAdjustment — the
        │                     shared write path for the 5 FACT tables
        ├── members.cjs, payments.cjs, membershipRecords.cjs,
        │   equipmentRecords.cjs, attendance.cjs, activityLog.cjs,
        │   plans.cjs, customFields.cjs, users.cjs, gyms.cjs
        │                     one file per src/data/*.js counterpart
        ├── watchers.cjs      EventEmitter pub/sub for watchUserRecord/watchGym
        ├── bootstrap.cjs     writes an already-fetched bundle into SQLite
        │                     (src/data/local/bootstrap.js does the fetching)
        ├── sync.cjs          push-side reads (getPending*/markSynced/etc.) —
        │                     src/data/local/sync.js does the Firestore writing
        └── index.cjs         operation-name -> function dispatch map
```

A small backend (`server/` for license signing) arrives with the sync
engine — see §15.

---

## 6. Data model

Every FACT record (via the ledger) carries: `id`, `actor_uid`, `created_at`,
`sync_status`. Every ENTITY carries at least `id`, `created_at`, `actor_uid`.
Fields marked `?` are optional/may be absent (Firestore never stores
`undefined`).

### gyms (entity) — super-admin creates, owner reads
```
id, name, prefix (UPPER, unique, permanent), address?,
status: "active" | "suspended",
member_seq: number (counter for member numbers, bumped in a transaction),
affiliate_id?, affiliate_name?,   // set if an affiliate marketer brought this gym in
country_code?, country_name?, currency_code?  // set at creation (NewGym.jsx's
  // CountryPicker), PERMANENT like prefix — every member payment/plan price
  // this gym ever records renders in currency_code (lib/helpers.js's
  // formatMoney), so changing it later would make its own historical revenue
  // numbers incoherent. Absent on gyms created before this field existed;
  // formatMoney treats that the same as NGN/Nigeria (its default), matching
  // how the app always behaved for them. src/lib/countries.js has the full
  // ISO 3166-1 country list, each mapped to its ISO 4217 currency.
subscription: {
  activated_at, expiry_date, grace_hours: 24,
  last_verified_at, locked: bool,
  plan_id?, plan_name?            // which platform_plans tier funded the current expiry, if any
},
created_at, actor_uid
```

### users (entity) — super-admin creates owners/affiliates, owner creates receptionists
```
id (= Firebase Auth uid),
role: "superadmin" | "owner" | "receptionist" | "affiliate",
name, username, gym_id (owner/receptionist only — absent for superadmin/affiliate;
  for an owner this is their permanent PRIMARY branch, unchanged since creation),
gym_ids?: string[]  // OWNER ONLY (§18) — every branch they manage, primary first.
  Absent on receptionist/affiliate/superadmin docs and any owner created before
  §18; firestore.rules' myGymIds() falls back to [gym_id] for those.
subscription?: { activated_at, expiry_date, grace_hours, last_verified_at,
  locked, plan_id, plan_name }  // OWNER ONLY (§18) — the pooled subscription
  covering every gym_ids branch; mirrored (cached) onto each of those
  gyms/{id}.subscription — see data/subscriptions.js.
phone?, address? (receptionist/owner), email? (contact address, unused by any
  feature yet — captured for a future notification feature),
active: bool, must_change_password: bool,
bank_name?, account_number?       // affiliate only, self-service payout details
created_at, actor_uid
```

### plans (entity) — owner creates, a GYM's own membership/equipment plans
```
id, gym_id, type: "membership" | "equipment",
name (e.g. "Standard", "VIP", "Monthly"),
duration_count: number, duration_unit: "day"|"week"|"month"|"year",
  // membership is always 1 year; equipment is owner-defined
price: number, active: bool (retire = false, never hard-delete),
created_at, actor_uid
```

### custom_fields (entity) — owner creates, extra registration questions
```
id, gym_id, label, type: "text" | "number" | "yesno", required: bool,
active: bool (retire = false — can ALSO be hard-deleted, unlike plans;
  members who already answered keep their answer either way),
created_at, actor_uid
```

### members (entity) — receptionist creates
```
id, gym_id, member_no (e.g. "ITF-0001"),
name, phone, dob?, gender?, date_joined, photo_url?,
emergency_name?, emergency_phone?,
email?, address?,           // full-profile only, not check-in view
custom_fields?: { [fieldId]: value },
fingerprint_template?,      // schema reserved, not implemented — no UI reads/writes this
active: bool, created_at, actor_uid
```
`photo_url` went live 2026-08-29 (it was reserved in this schema but
unbuilt before that — `fingerprint_template` above is still in that state).
Never required at registration — some gyms collect a passport photo, some
don't, some just haven't taken it yet — and always addable/replaceable
later from the member's own profile. See §15's new Storage sub-section.

### membership_records / equipment_records (FACT) — receptionist creates, append-only
```
id, gym_id, member_id, plan_id, plan_name,
start_date, expiry_date, payment_id,
+ ledger fields
```
For equipment specifically: this record is **not created at payment time** — see
§8's "deferred equipment activation."

### payments (FACT) — receptionist creates, append-only, amount FROZEN
```
id, gym_id, member_id, receptionist_uid,
plan_id, plan_name, plan_type,
amount (copied from the plan at time of payment — NEVER follows later price changes),
for: "membership" | "equipment",
duration_count, duration_unit,  // ALSO frozen from the plan — an equipment payment's
                                 // matching equipment_record isn't created until later
                                 // (§8), so it needs the plan's duration as it stood
                                 // at PAYMENT time, not read fresh off the plan then
paid_at, + ledger fields
```

### attendance (FACT) — receptionist creates, append-only
```
id, gym_id, member_id, receptionist_uid, recorded_at, + ledger fields
```

### activity_log (FACT) — receptionist actions, append-only, a gym's own staff feed
```
id, gym_id, actor_uid, action, target, at
```

### adjustments (FACT) — corrections, append-only
```
id, gym_id, collection, adjusts_id, reason, actor_uid, created_at, ...corrected fields
```

### platform_plans (entity) — super-admin creates, what GYMS pay the PLATFORM — ALSO the public pricing cards
```
id, name, amount, duration_days: number,
max_members, max_receptionists: number | null,   // null = unlimited. Informational only — nothing enforces these yet
blurb, cta, features_intro: string, featured: bool, features: string[],
active: bool, created_at, actor_uid
```
One object, two audiences, deliberately — not two separate models. A
prospect sees a tier on the public Pricing page before they ever sign up;
the super admin then assigns their gym to that exact same plan at
registration (Subscriptions → SubscriptionModal), so the billing side and
the sales side could never be allowed to drift into different objects (see
§17's history — this used to be two, unified 2026-08-29). `active` plans
are what the public Pricing page renders as cards; `max_members`/
`max_receptionists` render as the first two feature bullets there too
("Up to N members" / "Unlimited members"). This is also the ONE collection
in this database with a public read rule (§17) — a signed-out visitor
loads the pricing page directly. Writes stay super-admin-only.

### platform_payments (FACT) — append-only, a gym's payment TO the platform, amount FROZEN
```
id, gym_id, gym_name, plan_id, plan_name, amount, duration_days, paid_at, + ledger fields
```

### platform_settings (single doc, id "config") — super-admin sets
```
affiliate_commission_percent: number   // % of a platform payment an affiliate earns
```

### affiliate_earnings (FACT, one narrow mutable field — see §2.2)
```
id, affiliate_id, affiliate_name, gym_id, gym_name, platform_payment_id,
payment_amount, commission_percent, earned_amount (all frozen at creation),
status: "pending" | "paid",       // the ONE field that's ever updated post-creation
paid_at? (set when flipped to "paid"),
created_at, actor_uid
```

### admin_activity_log (FACT) — super-admin actions, append-only, platform-wide audit trail
```
id, gym_id, gym_name, activity, status, performed_by, at
```

---

## 7. Accounts, usernames, permissions

**Login is by USERNAME.** Firebase needs an email, so `usernameToEmail()` maps
`name` → `name@gymos.app` (constant `AUTH_EMAIL_DOMAIN` in `lib/helpers.js`; no
mail is delivered there — it is purely an identifier). Super-admin username is
`admin`.

**Usernames must be globally unique** (they become emails). Gym staff usernames
are **prefixed with the gym prefix**: owner of `ITF` → e.g. `itf-owner`,
receptionist → `itf-reception1`. Affiliate usernames are freely chosen (they
aren't scoped to any one gym). This prefixing is built into account creation
so collisions are impossible.

**Creating accounts without logging out the creator:** the client SDK's
`createUserWithEmailAndPassword` signs you in AS the new user. Worked around
via a **secondary Firebase app instance** (`initializeApp(config, "secondary-<ts>")`
in `data/users.js`), then signing that secondary out. Primary session stays
intact. (A Cloud Function with the Admin SDK is the cleaner long-term option —
deferred to the `server/` phase.)

**Every new account starts on the same `DEFAULT_PASSWORD`** ("Welcome123").
`must_change_password` forces a real password before the account can do
anything else — enforced both client-side (`SetPasswordPage.jsx` intercepts
every route until it's cleared) and server-side (the one Firestore rule that
lets a signed-in user touch their own `users/{uid}` doc before otherwise
having any write access at all is scoped to flipping exactly that one field).

**Changing your own password later** (`data/accounts.js#changePassword`, used
by `components/ChangePasswordForm.jsx` from every role's Settings surface):
Firebase requires a *recent* sign-in for this, so it re-authenticates with the
current password first (`reauthenticateWithCredential`) rather than surfacing
a cryptic `auth/requires-recent-login` error.

**There is no self-serve "forgot password."** No email is ever sent by this
app. If someone forgets their password today, an owner/super-admin must
recreate or otherwise reset the account by hand. A real fix needs either a
server-side Cloud Function (requires Firebase's paid Blaze plan) or an
external serverless function using `firebase-admin` — deliberately not built
yet (see §14).

**Permission table (enforced in `firestore.rules`):**

| Collection | Super-admin | Owner | Receptionist | Affiliate |
|---|---|---|---|---|
| gyms | C, R, U (all) | R (own) | R (own, minimal) | R (gyms they referred) |
| users | C, R, U (all) | C, R, U (receptionists, own gym; cannot edit their role/gym) | R (self) | R (self + the full doc of any `role: "owner"` user whose gym they referred — rules can't restrict individual fields, the app just only ever *displays* name/phone from it); U (self: `bank_name`/`account_number` only) |
| plans | R (all) | C, R, U (own; U = retire/edit; never hard-deleted) | R (own) | — |
| custom_fields | R (all) | C, R, U (own; U = retire/edit), D (own — unlike plans, CAN be hard-deleted) | R (own) | — |
| members | R (all) | R (own) | C, R, U (own, bio-data only — name/phone/gender/dob/weight/height/emergency contact/address/email/custom_fields; `firestore.rules`' `affectedKeys()` allow-list blocks anything else, not just an absent UI button) | — |
| membership_records / equipment_records | R (all) | R (own) | C, R (own) — no update/delete | — |
| payments | R (all) | R (own) | C, R (own) — **no update/delete by anyone** | — |
| attendance | R (all) | R (own) | C, R (own) — **no update/delete by anyone** | — |
| activity_log | R (all) | R (own) | R (own actions), C (own) | — |
| adjustments | R (all) | R (own) | C, R (own) — no update/delete | — |
| platform_plans / platform_settings | C, R, U (all) | — | — | — |
| platform_payments / admin_activity_log | C, R (all) | — | — | — |
| affiliate_earnings | C, R, U (all — the rule itself doesn't restrict which fields U can touch, only WHO; the client only ever flips `status`) | — | — | R (own) |

Also: **a locked/suspended gym serves NO operational data** — the rules
refuse reads of a locked gym's members/payments/attendance/etc. (see §13).

**This table's `owner→users` and `receptionist→members` update grants
predate their UI** — `firestore.rules` and `src/data/{users,members}.js`
already supported an owner editing a receptionist's contact info and a
receptionist editing a member's bio-data before either screen actually
had a button for it. Both UIs now exist (`StaffProfile.jsx`,
`MemberProfile.jsx` — see §15), catching the app up to what the rules
already allowed rather than granting anything new; `members`' rule
additionally gained the explicit bio-data-only `affectedKeys()` allow-
list at the same time, so it's no longer "permitted by the rule's
absence of a restriction," it's an explicit one.

---

## 8. Desk behaviour (the heart)

**Check-in flow:** search → profile appears → Details card (identity +
Membership/Equipment status folded in) → entry verdict → Record Attendance,
right next to each other at the bottom.

- **No navbar for desk.** `DeskHome.jsx` renders no persistent nav — the
  default/index route is `CheckIn`. Switching between Check-in/Members/
  Finances is a `.tabs-row` (NavLink pills) rendered independently on all
  three of `CheckIn.jsx`, `DeskMembers.jsx`, and `DeskFinances.jsx`, the same
  pattern `MarketersList`/`MarketersRevenue` and `AffiliateGyms`/
  `AffiliateRevenue` already use. "Register a new member" sits as a button on
  the far right of that same row (`/desk/register` — a full route, not a
  popup, since it's a primary frequent workflow, not a rarely-touched
  setting).
- **Search two ways, both live client-side filters (no fingerprint):** the
  gym's member roster loads once (`listMembers`) and two independent boxes
  filter it on every keystroke — name-or-phone (free text) and member number
  (a `.username-combo`: the gym's prefix is fixed, the receptionist types only
  the numeric suffix). No submit button. Fingerprint search was removed
  (not being built for now); `member.fingerprint_template` is a reserved-but-
  unused schema field for a possible later add. **`CheckIn.jsx` shows nothing
  until searched** — deliberately search-only, not a browsable list (see
  `DeskMembers.jsx` below for that).
- **Results table rows are the open action** (`row--expandable`, `onClick`
  navigates) — no separate "Open" button/column.
- **Members (`DeskMembers.jsx`):** the middle tab — the full roster,
  alphabetical, with one `SearchToggle` box (name/member no./phone) for
  narrowing it, no separate "search first" requirement the way `CheckIn.jsx`
  has. Exists specifically so the desk can browse/scan who's on the books
  without needing to search for anything — a deliberately separate page from
  Check-in, not a "show everything when the search box is empty" fallback on
  the same page (tried that first; the request was explicit that browsing and
  fast lookup are two different jobs, not one screen doing both).
- **Membership** = annual, owner-defined tiers (Standard/VIP/Student...).
- **Equipment** = owner-defined plans with `duration_count` + `duration_unit`.
  Time-based, NOT visit-based (expires by the clock whether or not they showed).
- **Expiry math (`logic/expiry.js`):** `expiry = start + count·unit`.
  - `day` → **end of the purchase day (local midnight)**. A daily pass bought at
    any time stays valid through that day; next day they pay again.
  - `week` / `month` / `year` → by calendar (buy weekly on the 5th → end of the
    11th, etc.), regardless of visits.
- **Expired at the desk → collect payment → flips green.** Same for membership.
- **Payment:** receptionist SELECTS a plan; amount auto-fills from the plan and
  is **frozen** into the payment (never follows later price changes), along
  with `duration_count`/`duration_unit` (see below for why). Records member,
  receptionist, plan, amount, for, time.
- **Deferred equipment activation:** paying for equipment does NOT start its
  clock. `equipment_records` (append-only, §2.2) is only created on the
  member's **next attendance after that payment** — a monthly equipment
  payment's 30 days start counting from whenever they actually first show up,
  not from the moment they paid. Tracked without ever mutating a record:
  `MemberProfile.jsx` computes the most recent equipment `payment` with no
  `equipment_records.payment_id` pointing back to it ("pending"); if one
  exists, `handleAttendance` creates the `equipment_records` doc right after
  recording the attendance, with `start_date = now`. Membership has no such
  deferral — its record is created immediately at payment time, same as
  before.
- **"Record attendance" is gated on membership only, not the combined
  verdict** (`disabled={!membershipActive}` — NOT `!v.allowed`). This is
  necessary, not just convenient: a first-time equipment payment can only
  become active as a *side effect* of recording attendance (above), so gating
  that button on equipment-also-active would deadlock it permanently for
  anyone with a still-pending equipment payment. It's also consistent with
  the pre-existing "walking out green on membership / red on equipment"
  registration story below — attendance/entry was always meant to be
  possible with equipment red. The `EntryVerdict` banner itself is unaffected
  and still shows the real combined `membershipActive AND equipmentActive`
  picture; only the button's enablement changed.
- **Attendance is once-per-day.** Once recorded, the button disables itself
  ("Already checked in today") until local midnight — computed client-side
  (`attendance.some(a => recorded_at >= startOfDay(now))`), not a separate
  flag on the record.
- **Attendance is always a deliberate button click, never automatic.**
  Scanning/searching only opens the profile — people come to inquire or pay
  without training.

**Registration (`RegisterMember.jsx`):** create person → **membership payment
REQUIRED** (creates its `membership_record` immediately) → **equipment
payment OPTIONAL** (creates ONLY the `payment`, no `equipment_record` yet —
see deferred activation above; they may register today, train later, walking
out green on membership / pending on equipment). Member number auto-assigned
via a transaction that bumps the gym's `member_seq` (`PREFIX-0001`,
`PREFIX-0002`...). Fingerprint not implemented. Any `custom_fields` the owner
has configured for the gym appear on this form too. A `← Back` link
(`navigate(-1)`) sits above the form.

**Returning member:** find and renew — never create a duplicate. Search by
phone/name before creating; if found, renew on the existing record so history
stays whole.

**Desk finances (`DeskFinances.jsx`):** the third tab — what
THIS receptionist personally collected (client-side filter on
`receptionist_uid`, since `listPaymentsByGym` is already a read every
receptionist has), with a Today/All-time `FilterMenu` and a running total.
This is deliberately narrower than the owner's `Finances.jsx` (whole gym, by
plan, expandable). A member's own full history (all-time, every receptionist)
is still on their profile's Payments/Attendance tabs — see below.

**Member profile (`MemberProfile.jsx`, shared by desk and owner):** identity +
a Details card + payment/attendance history. Membership and Equipment are
**grid cells inside the Details card** (a `PlanCell` component) for BOTH
roles now, not separate cards — status text always shown, plus (desk only,
via `editable`) an inline Renew/Activate → plan-picker → Collect
payment/Cancel flow right under the status. An equipment `PlanCell` showing
"Pending" (paid, not yet activated) hides the renew control until that
resolves.
- **Desk only**, rendered directly below the Details card (not at the top of
  the page anymore) and immediately above the "Record attendance" button:
  the entry-access verdict card (`EntryVerdict`) — verdict and action sit
  next to each other now, instead of verdict-at-top/action-at-bottom.
- **Owner** (read-only per §10) sees the same Details-card layout minus the
  renew controls, verdict banner, and attendance button (owners aren't
  checking anyone in).
- Both see: identity header, the Details card, and a Payments/Attendance
  history tab card — every payment and attendance record for this member,
  all-time, regardless of which receptionist collected/recorded it.
- **Back navigation** uses `navigate(-1)` (browser history), not a hardcoded
  route — so it always returns to wherever the profile was actually opened
  from (Members list, Attendance, Expiring-soon, Check-in search), never a
  fixed "home" page.

---

## 9. Shared UI conventions

Established patterns any new screen should follow rather than reinvent:

- **`Modal.jsx`** — the one popup primitive. Backdrop click or Escape closes
  it; a click inside the card doesn't. Modals CAN nest (a popup opening
  another popup on top) — used for "summary + Edit button → dedicated edit
  popup" flows.
- **"Rarely-touched settings become a button + popup, not an always-open
  form."** Established across super-admin Settings, the affiliate's payout
  details, and owner's GymSettings: a section shows a short summary (or a
  list/table) with a small action button (`Create a plan`, `Edit`, `Add
  field`, `Change password`) that opens a `Modal` with the actual form. Only
  things read/used constantly (a plans TABLE, a staff list) stay always
  visible; the FORM that creates/edits an entry does not.
- **`ChangePasswordForm.jsx`** — one shared component reused from every
  role's Settings surface. Takes an optional `showTitle` prop (`false` when
  it's already inside a Modal titled "Change password", so the heading
  doesn't repeat).
- **`SearchToggle.jsx` / `FilterMenu.jsx`** — a list page's heading row (e.g.
  "Members") carries a small filter-icon button (opens a `.popover` with
  mutually-exclusive options, anchored to grow rightward/downward so it can't
  run off the edge of a narrow card) and a search-icon button (expands into a
  compact input, collapses back to just the icon and clears its query when
  toggled shut) — instead of an always-visible search box + a row of filter
  tabs eating vertical space. Used by Members, Attendance, and (filter only)
  Finances.
- **`PhoneNumber.jsx`** — every phone number shown anywhere in the app is
  click-to-copy (copies to clipboard, shows "Copied!" briefly). Always use
  this component instead of rendering `{person.phone}` directly.
- **Two money systems, deliberately not one.** `naira(amount)` (hardcoded ₦)
  is for PLATFORM-level money only — `platform_plans`/`platform_payments`/
  `affiliate_earnings`, i.e. Settings/Revenue/Subscriptions/MarketersRevenue/
  AffiliateRevenue/AffiliateDetailPage/GymDetailPage's billing tab/
  SubscriptionModal. `formatMoney(amount, gym.currency_code,
  gym.country_code)` (lib/helpers.js, `Intl.NumberFormat` under the hood) is
  for a GYM's OWN money — its plans' prices, its members' payments, its
  revenue reports: `PlanPicker`, `RegisterMember`, `MemberProfile`,
  `GymSettings`, owner `Finances`/`OwnerHome`, `DeskFinances`. The split is
  intentional, not an inconsistency to "fix" by merging them: super-admin's
  platform-level pages aggregate money ACROSS gyms that may be in different
  currencies, and summing ₦ + $ + KSh into one number without real FX
  conversion (which this app doesn't do) would be meaningless — so those
  pages stay in one fixed reference currency no matter what any individual
  gym uses. `countryCode` matters as much as `currencyCode` to formatMoney:
  the same currency renders differently by region (`Intl.NumberFormat("en-ZA",
  {currency:"ZAR"})` → "R 15 000" vs generic `"en"` → "ZAR 15,000"), so it's
  the country that picks the formatting locale. Gyms created before this
  field existed have no `currency_code` — formatMoney's default (NGN/NG)
  reproduces the exact ₦ output they've always had.
- **`CountryPicker.jsx`** — the type-ahead combobox behind gym registration's
  country field (`NewGym.jsx`, `src/lib/countries.js`'s data). Same `.popover`
  dropdown shell as `FilterMenu`, but sized to the input's own width (not
  content-width) and arrow-key/Enter navigable. Reports a real country object
  via `onChange` only once one is actually picked — typing without selecting
  reports `null`, so a caller can gate submit on "they chose a real country,"
  not just "they typed something." A gym's country/currency, once set, is as
  permanent as its prefix — see the note on `gyms.currency_code` in §6.
- **Serial numbers on every list table.** Any table rendering more than a
  couple of records — payments, attendance, members, gyms, marketers, staff,
  plans, activity logs, earnings, everything — gets a leading `#` header and
  a `className="muted"` `{i + 1}` cell, by default, without being asked.
  Applies from the first version of a new table, not added after the fact.
  Skip only genuine single-row displays (a gym's own Owner card is never a
  list). Row components used by more than one table (`ExpandableActivity`,
  per-row inline-edit components like `GymSettings.jsx`'s `PlanRow`/
  `CustomFieldRow`) take an `index` prop so both their display and edit
  branches number consistently.
- **`ExpandableActivity.jsx`** — any list of dated log entries (admin
  dashboard's recent activity, a gym's own activity feed) shows the 10 most
  recent by default with a "Show all (N)" toggle; only once expanded does a
  date filter appear.
- **`TrendChart.jsx`** — hand-rolled SVG line/area chart (no charting
  library). X-axis day labels below the plot, Y-axis value ticks (max/half/
  zero) to its left; a floating tooltip on hover/focus per point.
- **No underlines anywhere** — links, active nav, and "this is clickable"
  cues are carried by color/weight/border, never `text-decoration:
  underline`. A global `a { text-decoration: none }` reset enforces this.
- **Light-mode card contrast:** page background is pure white, card surfaces
  are a hair dimmer (`#F9FAFB`) so panels read as distinct without a heavy
  border. Dark mode is the inverse relationship (surfaces lighter than the
  page background), unchanged from the original design.
- **No logo watermark.** There used to be a giant rotated logo image fixed
  behind every authenticated page (`components/Watermark.jsx`) — removed
  entirely (deleted the component; per-page usage sites and their now-
  purposeless `.page-watermark-content` wrapper divs are gone too) because it
  read as a low-effort template graphic, not a considered design choice. In
  its place: a faint dot-grid texture on `body` (built from `--tint-rgb`, so
  it's already theme-correct with no separate dark-mode asset) that only
  shows through the true `--bg` gaps between cards — texture, not a graphic.
  The one spot that still wants a deliberate decorative touch, the login
  hero panel, gets its own soft radial glow (`.login-split__panel::before`)
  instead of the old logo image.
- **Optional custom background photo, zero code changes.** `body`/`.login`/
  `.boot` all paint an optional `url("/background.jpg")` as their TOP
  background layer, with the dot-grid (and, on `.login`/`.boot`, the vignette
  too) as the layer(s) beneath. Drop a file at `public/background.jpg` and
  it's used automatically; if that file doesn't exist, the 404'd layer just
  doesn't paint — CSS has no error state for a missing background-image, so
  this is a real fallback, not something that needs a JS existence check.
  Same "only shows in the gaps between opaque cards" property as the
  dot-grid, so an unpredictable photo can never interfere with reading card
  content regardless of what it looks like.
- **Depth + motion, still monochrome.** `.card`/`.stat-card`/`.trend-chart`
  play a quiet `card-in` fade-up (0.28s, plays once per mount — i.e. once per
  navigation to that route, not on every re-render/filter change within it).
  `.card--link`/`.stat-card--link` lift on hover (`translateY(-2px)` + a
  deeper neutral shadow) the same way `.btn`/`.row--expandable` already
  signalled interactivity. `.btn--primary` gets a resting shadow, a hover
  lift, and an `:active` press-scale. `Modal.jsx` fades its backdrop in and
  scales its card up from 97% — deliberately distinct from `.card`'s upward
  slide, so a popup reads as "a dialog appeared," not "another page card."
  None of this touches any `--` color token — pure shadow/transform/opacity.
- **`font-variant-numeric: tabular-nums`** on `.table` and `.stat-card__value`
  — money/count columns keep their digits aligned instead of each row
  jittering width with proportional-width numerals.
- **`:focus-visible` outline** (`outline: 2px solid var(--text)`) on
  buttons/links/tabs/expandable rows — keyboard-only, so a mouse click never
  shows a ring. Text inputs/selects didn't need this (they already swap
  `border-color` on `:focus`).
- **Theme:** `theme.jsx` — light/dark/system, persisted to `localStorage`,
  applied as a `data-theme` attribute on `<html>`; a `ThemeToggle` swatch
  button lives in every topbar, a fuller `ThemePreference` picker lives in
  each role's Settings.
- **Mobile (`@media (max-width: 700px)` in `index.css`):** topbar/nav wrap
  and the nav scrolls horizontally instead of overflowing; tables become
  horizontally-scrollable blocks instead of squeezing columns unreadable;
  a stat-card row that never wraps on desktop wraps to 2-per-row; modal/card
  padding and heading sizes shrink. Input font-size is deliberately left at
  16px on mobile — smaller triggers iOS Safari's auto-zoom-on-focus.
- **CSS flexbox gotcha worth remembering:** a flex item (row direction)
  defaults to `min-width: auto`, floored at its content's intrinsic width —
  invisible in a wide container, but it silently overflows a narrow one (a
  Modal, a mobile viewport). Bit us twice (`.row2` columns, then the nested
  `.username-combo` prefix+input row). Fix is always `min-width: 0` on the
  item that refuses to shrink.

---

## 10. Owner site

Nav: **Dashboard, Members, Attendance, Finances, Team, Settings**, plus
**All branches** (§18 — appears only for an owner managing more than one
gym) (plus Expiring-soon and a member profile, both reached by drilling in,
not from the nav bar). A locked/suspended gym shows `LockedScreen` instead
of the whole shell (client-side mirror of the server-side rule refusal).

**Multi-branch owners (§18):** every screen below is scoped to whichever
branch is currently *active*, not necessarily the owner's original gym — a
`<select>` in the sidebar (only rendered when there's more than one branch
to choose from) switches it, and every page here reacts automatically
(they all already read one `gymId` from `useAuth()`). **All branches**
(`CrossBranchReport.jsx`) is the one screen that ISN'T single-branch-scoped
— an aggregate stat row (branches/members/today's attendance/this month's
revenue, revenue only combined when every branch shares one currency) plus
a per-branch table, clicking a row switches the active branch and jumps
into its own dashboard.

- **Dashboard (`OwnerHome.jsx`)** — 5 stat cards (today's attendance,
  today's/this-week's revenue, active members, expiring-in-7-days), each a
  `Link` through to the relevant page, plus two `TrendChart`s (14-day revenue,
  14-day check-ins).
- **Members (`MembersList.jsx`)** — every member, alphabetical. Heading row
  carries a `FilterMenu` (All / Active Membership / Expired Membership /
  Expiring Soon — 30-day window) and a `SearchToggle` (matches name, member
  number, phone, email, address, emergency contact, or any custom
  registration field). Table: member no., name, phone, membership status.
  Click a row → `MemberProfile` (owner's read-only view, §8).
- **Attendance (`Attendance.jsx`)** — same `FilterMenu` (Today / This week /
  This month / Custom) + `SearchToggle` treatment. Rows expand
  (`ExpandableRow`) to reveal which receptionist recorded them.
- **Finances (`Finances.jsx`)** — defaults to "Daily" until the `FilterMenu`
  (Daily/Weekly/Monthly/Custom) changes it. Total for the range, a "Revenue by
  plan" breakdown, and a "Transactions" table (expandable rows reveal the
  receptionist who collected each payment).
- **Team (`ManageStaff.jsx` / `StaffProfile.jsx`)** — staff table with an "Add
  a receptionist" button (top-right of the heading) opening a popup: name,
  username (gym-prefixed), phone, address, email. Click a row → `StaffProfile`
  (full name, username, phone, address, email, activity log, deactivate).
- **Expiring-soon (`ExpiringSoon.jsx`)** — the 7-day renewal chase list
  (membership + equipment), reached from the dashboard card, not the nav.
- **Settings (`GymSettings.jsx`)** — read-only gym identity/status/
  subscription; Membership tiers and Equipment plans (table + "Create plan"
  popup each, per §9); Registration fields (table + "Add field" popup);
  Appearance (`ThemePreference`); "Change password" button + popup at the
  bottom.

**Owner is read-only on operational records** (members, payments, attendance —
R only, no U) but **controls** plans/prices, custom registration fields, staff
(create/manage receptionists in own gym), and gym-level settings. Owner
**cannot** alter a receptionist's transaction records (guaranteed by
append-only rules), cannot see other gyms, cannot change their own role/gym.

---

## 11. Super-admin console

Nav: **Dashboard, Gyms, Subscriptions, Revenue, Marketers, Sync Monitor,
Settings.**

- **Dashboard (`Dashboard.jsx`)** — 6 stat cards (today's attendance, total
  members, total staff, active/locked/total gyms), a "Recent Gym Activity"
  card (`ExpandableActivity`, §9 — 10 rows, then "Show all" + date filter),
  and a "Gyms Needing Attention" preview (drills into `AttentionPage.jsx`).
  `logic/gymHealth.js` decides what counts as an "issue" (locked, overdue,
  grace, expiring soon, or no recent sync) and its priority.
- **Gyms (`GymsList.jsx` / `GymDetailPage.jsx` / `NewGym.jsx`)** — "Register a
  gym" is a popup with a New-owner/Existing-owner toggle (§18): new owner is
  the original flow (name, prefix, address, owner name/phone/email, optional
  affiliate marketer to attach); existing owner instead searches for one
  (`OwnerPicker.jsx`) and just attaches the new gym as another branch — no
  new login, no affiliate picker. A gym's detail page: header (rename), 3
  stat cards, Gym status / Subscription status blocks (Subscription's
  "Manage billing" links out to `OwnerDetailPage.jsx`, described next — not
  an inline modal anymore, since one subscription can now cover several of
  this owner's gyms), a 14-day check-ins trend chart, Owner / Receptionists
  cards (click a row → `PersonDetailModal`: editable phone + email,
  activate/deactivate; if no owner yet, a "Create owner" popup), Recent
  activity (`ExpandableActivity`), and a "Danger zone — testing only" card
  (§2.6). No payment-history card anymore — that moved to `OwnerDetailPage`
  too, since it's the owner's payment history now, not one gym's.
- **`OwnerDetailPage.jsx`** (§18, route `/admin/owners/:id`, drill-down only)
  — the ONE place billing is managed: status/plan/expiry/grace summary for
  the owner's pooled subscription, every branch they manage (linking back to
  each `GymDetailPage`), and the account's full payment history. Opens
  `SubscriptionModal.jsx` (`owner`/`primaryGym` props, not `gym`) — same
  popup Subscriptions.jsx's rows also open, so the two entry points can
  never drift out of sync. The modal's plan dropdown extends by that plan's
  duration (logs one `platform_payments` record covering every branch +, if
  the owner's PRIMARY gym has an affiliate attached, an `affiliate_earnings`
  record at the platform's current commission rate — decided once, at
  original signup, never re-evaluated per branch), a custom-date fallback
  with no revenue logged, and instant-lock/unlock (fans out to every branch
  in one atomic batch — `data/subscriptions.js`).
- **Subscriptions (`Subscriptions.jsx`)** — every OWNER now, not every gym
  (§18): branch count, pooled status/plan/expiry/days remaining; tapping a
  row opens `SubscriptionModal`. Per-branch suspend/reactivate stays exactly
  where it always was, on `GymsList.jsx`/`GymDetailPage.jsx` — a different,
  independent dimension from billing.
- **Revenue (`Revenue.jsx`)** — 3 stat cards (revenue this month, affiliate
  payout owed this month, all-time revenue — hideable), revenue by owner
  account (§18 — falls back to the old gym-name shape for payments recorded
  before pooled billing), recent platform payments.
- **Marketers (`MarketersList.jsx` / `MarketersRevenue.jsx` /
  `AffiliateDetailPage.jsx`)** — two sub-pages (roster / payouts) under one
  `Marketers` nav entry. Roster: alphabetical, "Register a marketer" popup
  (name, username, phone, email). Payouts: pending/paid-all-time per
  marketer, CSV export, "Mark as paid" (flips their pending
  `affiliate_earnings` to `"paid"`). A marketer's detail page: 2 stat cards
  (current unpaid / all-time paid) above their contact details, gyms they
  brought, earnings history.
- **Sync Monitor (`SyncMonitor.jsx`)** — every gym + when it last recorded
  attendance, i.e. the closest thing the web phase has to an offline-sync
  status (there's no literal sync queue yet — see `gymHealth.js`).
- **Settings (`Settings.jsx`)** — Pricing plans (table + "Create a plan"/
  "Edit" popup, §9): what GYMS pay the PLATFORM (amount, duration, picked in
  Subscriptions when extending a subscription) AND the public marketing
  site's Pricing page cards (max members/receptionists, blurb, CTA text,
  featured flag, extra feature bullets) — one plan, one form, both jobs; see
  platform_plans' own note in §6 for why. Affiliate commission (shown as a
  plain percent + "Edit" popup, §9); "Change password" button + popup at
  the bottom.

---

## 12. Affiliate / Marketer portal

A referral partner's own view — reached at `/affiliate`, created only by
super-admin (`MarketersList.jsx`). They never see a gym's members, staff, or
internal operations — only what they referred and what they've earned.

- **Gyms (index route, `AffiliateGyms.jsx`)** — every gym they brought in:
  name, the gym owner's name and phone (`PhoneNumber`, click-to-copy),
  status, since. No per-gym earnings column — commission is a flat platform
  rate, so it doesn't differentiate one row from another; the Revenue tab
  covers the money side.
- **Revenue (`AffiliateRevenue.jsx`)** — pending-payout / paid-all-time stat
  cards, earnings history table (date, gym, payment, commission %, what they
  earned, Paid/Pending), and "Payments are made at the end of every month" as
  a footer notice (deliberately NOT a banner at the top).
- **Settings** (gear icon in the topbar → popup) — Payout details (bank name +
  account number) shown as text with an "Edit" button opening its own popup
  (self-service — `setAffiliateBankDetails`, not something super-admin fills
  in for them); "Change password" button + its own popup underneath.

---

## 13. Licensing

- **Activation is online-required.** Desk must reach the server, which confirms
  the gym is paid + active before it runs.
- **Server is the source of truth.** Super-admin sets/extends expiry and can
  instant-lock. On the desk's next online contact it refreshes expiry and checks
  lock state.
- **Offline enforcement (Option A — DONE, Electron only, see §15 Phase 4).**
  The desk carries its last-known `expiry_date` and self-locks **24h
  (grace) after it passes**, on a **forward-only clock** (a rolled-back
  system clock is rejected — time may only move forward vs the newest
  time already seen, persisted in local `sync_meta` so a relaunch after
  rolling the clock back doesn't forget it). `logic/license.js`
  (`isPastGrace`, `isInGrace`, `advanceClock`) has always contained this
  math; it's now actually wired up as an enforcement gate in
  `src/auth.jsx`'s `AuthProvider` (Electron only) — see §15 for the full
  writeup. Still display-only on the web build, unchanged, since the web
  desk is always online and the server (next bullet) is the real gate
  there.
- **Lock = freeze use, NEVER delete data.** A locked desk blocks check-in,
  payments, attendance and shows `LockedScreen` ("subscription expired" /
  suspended). Records remain intact; extend + reactivate restores everything.
- **Web-phase enforcement (live today):** `firestore.rules`'
  `gymIsOperational(gymId)` refuses to serve a locked/suspended gym's
  operational data (members/plans/payments/attendance/activity/adjustments/
  custom_fields), so a locked gym's desk/owner session goes empty even if the
  browser UI itself weren't also showing `LockedScreen`. Note this rule only
  ever checks `status`/`subscription.locked`, never `expiry_date` — there is
  no auto-expiry cron anywhere in this Firebase-only project; a human
  super-admin action is what actually flips a gym web-side. Option A's
  offline self-lock is additional, Electron-only behavior on top of this,
  not a mirror of it.
- **Signed-license server (not started, deliberately deferred — same
  treatment as native fingerprint hardware).** A private-key-holding
  `server/` that signs licenses, desk verifying against a bundled public
  key, would raise the bar from "the app self-polices using locally-synced
  data + a tamper-resistant-to-clock-rollback clock" (Option A, now real)
  to "cryptographically defended against someone editing the local SQLite
  file directly." This project has no server component today (Firestore +
  rules only) — standing one up (hosting, key custody) is separate,
  larger infrastructure work, not part of finishing the offline phase.

---

## 14. What's NOT built yet

Roughly in the order it's likely to matter:

- **Forgot-password / account recovery.** No email is ever sent by this app,
  so there is no self-serve reset. Today, an owner/super-admin must manually
  recreate or otherwise handle a locked-out account. A real fix needs a
  server-side Cloud Function (Firebase Blaze plan) or an external serverless
  function using `firebase-admin` — sketched out in conversation, not built.
- **Actually sending anything to the `email` field just added to accounts
  (§6/§7).** The field is captured and stored (owners, receptionists,
  affiliates); nothing reads it yet. Whatever notification feature motivated
  capturing it (digests, alerts, password-reset delivery) is still to design
  and build, likely via the same Cloud Function needed for password recovery.
- **A git repository.** This project has no version control initialized yet.
- **Deployment/hosting.** Nothing is deployed anywhere; this all runs from
  `npm run dev` / a local `npm run build` today. The user has stated intent to
  host this as a real website reachable by owners/marketers/superadmin (and
  occasionally receptionists) from mobile browsers — the CSS mobile pass in
  §9 is preparation for that, but there's no actual hosting/CI/domain set up.
- **Electron phase — native fingerprint hardware and the signed-license
  server only.** Everything else planned for the offline phase is done —
  native wrapper, local SQLite behind the `src/data/` seam, encryption at
  rest, the sync engine's push side, pull side (both the entity refetch
  and the cursor-based FACT/member pull), the periodic/online/manual sync
  triggers, and offline license enforcement as a real gate (Option A) —
  see §15. **Explicitly not started, both deliberately deferred:** native
  fingerprint hardware (a later update, per the user), and a signed-license
  server with its own keypair (§13) — real, separate infrastructure work
  this project has no groundwork for yet (no server component at all
  today, Firestore + rules only).
- **A real Firebase Auth Admin path for account creation/deletion.** Today,
  creating an account uses a secondary client-app-instance workaround
  (§7), and `dangerZone.js` can't delete the Firebase Auth user at all, only
  their Firestore doc (see the note in that file). A Cloud Function with the
  Admin SDK would fix both.
- **Bundle size.** `vite build` warns the single JS chunk is ~800KB
  (gzip ~200KB) — no code-splitting/`manualChunks` set up yet. Not urgent at
  current scale, but will matter once this is a real hosted site on mobile
  connections.
- **This BUILD.md itself needs to stay current.** Treat "update BUILD.md" as
  part of any task that changes the data model, permissions, or adds a new
  screen/role — it drifted badly out of date once already (this rewrite).

---

## 15. Electron / offline phase

**Scope, settled:** Desk and Owner get the desktop app and offline
capability. Admin and Affiliate stay web-only, permanently — Admin spans
every gym (nothing to scope a local cache to), Affiliate only ever views
its own referrals/earnings. Neither has an operational reason to work
offline the way a front-desk check-in flow does.

**Status: Phases 1–3 done in full (push; pull Milestones 1 and 2; sync
triggers, Milestone 3). Phase 4 (offline license enforcement) done as
"Option A." Offline authentication + idle auto-logout done (item 6).
Phase 5 (native fingerprint hardware) and the signed-license server
(§13) remain deliberately deferred — not part of this rewrite,
scoped as separate future work.**

1. **Native wrapper — DONE.** `electron/main.cjs` opens a `BrowserWindow`
   loading the built app (`dist/index.html` when packaged, the Vite dev
   server when `ELECTRON_DEV=true`). `electron/preload.cjs` bridges a
   single flag, `window.gymOS.isElectron`, via `contextBridge`
   (`contextIsolation: true`, `nodeIntegration: false` — the renderer has
   no direct Node/filesystem access, on purpose, and later phases add
   narrow methods to the bridge rather than loosening this). At this phase
   nothing about how the app *works* has changed — Desk/Owner/Admin/
   Affiliate all still talk to Firestore over the internet exactly like the
   browser build. This phase only proves the desktop packaging pipeline.
   - `npm run electron:dev` — Vite dev server + a window pointed at it,
     hot-reloading, for iterating on the app itself.
   - `npm run electron` — launches the last `npm run build` output as a
     window, no dev server.
   - `npm run electron:build` — builds the web app, then runs
     `electron-builder` (config lives in `package.json`'s `build` key) to
     produce a Windows installer under `release/` (git-ignored — the
     `electron/` source itself is tracked normally). **Needs a native
     build toolchain on the machine running this command** — Python 3 +
     Visual Studio Build Tools' "Desktop development with C++" workload
     — since `better-sqlite3-multiple-ciphers` (the encrypted-SQLite
     dependency) gets recompiled from source against Electron's own ABI
     every time (`@electron/rebuild`, invoked automatically; no prebuilt
     binaries exist for this module). Neither is installed by `npm
     install`. Confirmed working once both are present, even with a space
     in the project's folder path — `@electron/rebuild` logs an `⨯
     Attempting to build a module with a space in the path` warning citing
     a known node-gyp issue, but it's non-fatal here, the rebuild still
     completes. The produced installer is **unsigned** (no code-signing
     certificate configured — see §14's "code signing for real
     distribution," still not built) — Windows SmartScreen will show an
     "unrecognized publisher" warning on first run on any machine; that's
     expected today, not a broken build.
   - **App icon — DONE.** `build/icon.ico` (electron-builder's default
     `buildResources` location, auto-discovered — also set explicitly as
     `win.icon` in `package.json` for clarity), generated from
     `public/logo1.png` (the black-mark + green-check version — chosen
     over the white-mark `logo2.png` since a white icon tends to
     disappear against light OS chrome) padded onto a transparent square
     canvas at 6 resolutions (256/128/64/48/32/16px). Built by hand via
     PowerShell + .NET's `System.Drawing` (no new npm dependency,
     no image-processing package existed in this project) — the source
     PNG is a 351×259 rectangle, not square, so each frame centers it at
     ~88% fill with transparent padding rather than stretching/distorting
     it. **Regenerated 2026-09-04 (§19)** from the final `public/logo.png`
     via Pillow, at 7 sizes (16/24/32/48/64/128/256) — the light/dark
     `logo1`/`logo2` pair no longer exists.
   - **Window chrome — DONE, iterated twice in one pass.** First built a
     full custom title bar (frameless window, logo + "GymOS" text,
     custom minimize/maximize-restore/close buttons) to replace the OS's
     generic one; a live test then surfaced a real regression (below);
     immediately after, an explicit follow-up request replaced that whole
     approach with something simpler, which is what's actually shipped:
     **no title bar at all.** The window (`electron/main.cjs`) is still
     frameless (`frame: false`, and the unused default File/Edit/View/
     Window menu is still gone via `Menu.setApplicationMenu(null)`) and
     now opens **maximized by default** (`win.maximize()` before first
     show — "the natural view should be full screen"), with exactly one
     window control left: a small `src/components/CloseButton.jsx`,
     `position: fixed` top-right, a bare "×" with no circle/backdrop
     (explicit follow-up refinement — reads as part of the window chrome,
     not app UI), mostly-transparent until hovered (then solid `--bad`
     red text — the universal close-button convention), floating over
     the page rather than reserving a dedicated strip. `main.cjs` keeps
     only the `window:close` IPC handler (minimize/
     maximize/isMaximized and the maximize-state push event were removed
     entirely, not just unused, along with `preload.cjs`'s matching
     bridge methods — no dead code left behind from the first attempt).
     No drag region exists anymore either (there's no bar to drag by, and
     the window opening maximized was the actual point) — the window
     remains resizable via its edges regardless. Electron-only
     (`window.gymOS?.isElectron` gate in `App.jsx`) — the web build's
     browser chrome is untouched throughout. `LoginPage.jsx`'s own
     floating theme toggle (top-right, same corner) was removed in the
     same pass — same explicit call, "not much" value on the one screen
     that's the same every time regardless of theme; the theme toggle
     everywhere else (each shell's sidebar footer) is untouched.

     **Regression found during the first (title bar) attempt, still
     relevant to the layout even after removing the bar:** `.shell` (the
     Desk/Owner/Admin/Affiliate sidebar layout — `.sidebar` + a
     `.shell__main` that scrolls internally, keeping the sidebar itself
     always in frame) sized itself with a raw `height: 100vh`/`100dvh` —
     the *entire* window, not whatever space was actually left after the
     title bar. That made `.shell` render exactly `36px` taller than its
     real container, breaking the sidebar's fixed positioning and forcing
     a spurious extra scroll on pages that shouldn't need one. Fixed by
     having `.shell` size itself against its actual container instead
     (`height: 100%`) rather than assuming it owns the whole viewport —
     kept even after the title bar itself was removed, since it's simply
     the more correct rule regardless of what's above `.shell` in the
     tree. The dvh-vs-vh mobile-viewport awareness `.shell` used to
     provide for itself moved up to `html` instead (`height: 100vh;
     height: 100dvh;` there now, `body`/`#root` inherit via plain `%`),
     so the same mobile-address-bar handling still applies from one place
     at the top of the chain. (`grep`-confirmed `.shell` was the *only*
     rule anywhere in `index.css` using a raw viewport-height unit —
     nothing else needed the same fix.)

   **First real device test (post-Phase 4), one confirmed bug found and
   fixed:** every phase up to this point was verified only via standalone
   `node` scripts against `electron/local-db/*.cjs` directly — never a
   real installed app on a real machine (flagged as a gap throughout §15).
   The very first real login (as an Owner) white-screened and the app
   became unresponsive, reproducibly, even after a clean uninstall/
   reinstall. Root cause: `App.jsx` used React Router's `BrowserRouter`,
   which manipulates the History API (`pushState`/`replaceState`) against
   the *document's own origin* — fine for the web build and the Vite dev
   server (both real HTTP origins), but the packaged app loads
   `dist/index.html` via the `file://` protocol, which has no real
   origin/pathname structure for `history.replaceState('/owner')` to
   reconcile against. `Home()`'s post-login `<Navigate replace>` is the
   first place this ever fires — invisible until an actual login happened
   on an actual packaged build, which had simply never occurred before.
   Fixed: `App.jsx` now picks `HashRouter` instead of `BrowserRouter` when
   `window.gymOS?.isElectron` (`file:///…/index.html#/owner` sidesteps the
   History API entirely) — web build keeps `BrowserRouter` and its
   cleaner URLs, unchanged. Confirmed no `window.location` usage
   anywhere else in `src/` that a hash-based URL scheme would break.

   Two more things surfaced by that same real device's DevTools console,
   diagnosed but **not** bugs — noted so they aren't rediscovered as ones:
   - `ERR_FILE_NOT_FOUND` for `background.jpg`/`home.jpg`/`logo1.png`/
     `logo2.png` — these are `public/`-folder assets referenced by
     absolute path (`url("/home.jpg")`, `<img src="/logo1.png">`), which
     resolve fine on real HTTP hosting but not under Electron's `file://`
     load. Left as-is: every one of these already has a graceful
     fallback (the boot/login backgrounds are layered under CSS
     gradients that render regardless; `components/Logo.jsx` has an
     `onError` handler that swaps in a text wordmark) — cosmetic only,
     no functional impact, real fix would mean moving these into the
     module graph (`src/assets/`) as proper Vite-processed imports,
     deferred as a polish item, not urgent.
   - The 6 `FirebaseError: The query requires an index` messages on every
     `pullFactAndMembers` cycle are Milestone 2's already-documented,
     already-flagged required manual step (this section, Phase 3 Milestone
     2) — not a bug, just this device being the first to actually hit
     the missing indexes live. Each error message includes a direct
     Firebase Console link to create that exact index with one click;
     `firestore.indexes.json` at the repo root has the same six, ready
     for `firebase deploy --only firestore:indexes` once the CLI is set
     up.

2. **Local SQLite behind the `src/data/` seam — DONE.** Every
   Desk/Owner-relevant Firestore collection has a mirrored SQLite table in
   `electron/local-db/schema.cjs` (universal `id`/`created_at`/`actor_uid`/
   `sync_status` columns on every table, added even where Firestore's own
   shape lacks it today — e.g. `members`, `plans`, `custom_fields`, `users`
   — since the sync engine (§15.4) will need it everywhere). Library:
   `better-sqlite3-multiple-ciphers` (a drop-in, same-API SQLCipher-capable
   fork of `better-sqlite3`) — chosen specifically so encryption (§15.3)
   didn't need a second native dependency.

   Architecture: all SQL lives in `electron/local-db/` (main process
   only — `nodeIntegration: false` means the renderer can never
   `require()` a native module). `src/data/local/bridge.js` is the one
   renderer-side, SQL-free helper (`localInvoke(operation, args)`) every
   branched `src/data/*.js` function's Electron path calls, over one
   generic IPC channel (`window.gymOS.db.invoke`, registered in
   `electron/main.cjs` against a dispatch map in
   `electron/local-db/index.cjs`) rather than one bridge method per
   operation — this project has no TypeScript anywhere, so narrow methods
   wouldn't buy real compile-time safety, and registering a new operation
   is one map entry instead of a matching preload+main pair. `collectionName`
   arriving over IPC for the shared ledger write path (`appendRecord`/
   `appendAdjustment` — one seam, reused by `activity_log`/`attendance`/
   `equipment_records`/`membership_records`/`payments`, so those five
   files' `create*` functions needed no changes of their own) is checked
   against a hardcoded table allowlist before ever reaching SQL, since
   table/column names can't be parameterized with `?`.

   `members.js`'s `createMember` is the one function needing a real
   transaction (Firestore's `runTransaction` exists for multiple *browser*
   clients racing on `member_seq`; locally there's exactly one writer, so
   it collapses to `better-sqlite3`'s own synchronous `.transaction()`,
   auto-rollback on throw). The two live listeners `auth.jsx` depends on
   (`watchUserRecord`, `watchGym`) have a local equivalent in
   `electron/local-db/watchers.cjs` (a pair of `EventEmitter`s, per-uid/
   per-gymId, cleaned up on `webContents` destroy so `electron:dev`'s Vite
   HMR reloads can't accumulate stale listeners) — `auth.jsx` itself needed
   only one small addition (the bootstrap trigger below), not a rewrite of
   its watcher usage, since both branches return the same
   `(callback) => unsubscribeFn` shape `onSnapshot` already did.

   **Bootstrap import (not the sync engine — a one-time seed):** branching
   on `window.gymOS.isElectron` rather than actual online/offline status
   means a fresh install's local database starts completely empty. On
   first sign-in with a resolved `gym_id`, `auth.jsx` calls
   `ensureBootstrapped(gymId)` (`src/data/local/bootstrap.js`), which — if
   no local `gyms` row exists yet — reads the gym's current data straight
   from Firestore (deliberately NOT via the (now-branched) `src/data/*.js`
   functions, which would just route back to the still-empty local DB;
   small duplicate direct reads instead) and writes it into SQLite via a
   `bootstrapImport` operation with `sync_status: "synced"` (it's already-
   synced cloud data, not a new local edit). One-shot, no ongoing pull, no
   conflict handling — silently no-ops on failure (e.g. offline on a
   first-ever launch) rather than blocking sign-in.

   **Verification note:** this sandbox can't launch a real Electron
   window (confirmed during Phase 1). The full `electron/local-db/`
   operation layer — schema/migrations, the SQLCipher encrypt/decrypt
   round-trip, the `member_seq` transaction (including rollback-on-error),
   `appendRecord`/`appendAdjustment`, every row-mapper, the `gyms`
   subscription-un-flattening, the watcher pub/sub, and bootstrap-import
   idempotency — was exercised end-to-end via a standalone `node` script
   (not `electron .`; `safeStorage` itself is Electron-only, so the script
   stands in a raw hex string for the key half and validates the SQLCipher
   half only) with all checks passing. The IPC bridge + `auth.jsx`
   integration + real `safeStorage` flow are correct by construction and
   syntax-checked, but need confirming on an actual Windows machine —
   `npm run electron:dev`, sign in, confirm data appears locally and the
   app keeps working with the network off.

3. **Encryption at rest — DONE.** `better-sqlite3-multiple-ciphers`
   (SQLCipher), not vanilla SQLite. `electron/local-db/key.cjs`: on first
   run, generates 32 random bytes, wraps them via Electron's built-in
   `safeStorage` (Windows DPAPI), writes the wrapped blob to
   `gymos-local.key` in `app.getPath('userData')`; every later run,
   unwraps and reapplies the same key. Applied via the raw-key pragma form
   (`key="x'<hex>'"`, not the passphrase form) since the key is already
   random bytes, not something needing PBKDF2 strengthening. A wrong-key
   open doesn't fail on the `key=` pragma itself — only on the next real
   read — so `connection.cjs` runs a trivial sanity read immediately after
   setting the key, turning a wrong/corrupted key into an immediate, clear
   failure instead of a confusing error three calls later.

   Scoped honestly, same note as before it was built: this defeats casual
   access, a lost/stolen laptop, and browsing the filesystem — the
   standard bar essentially every desktop app with local storage operates
   at. It is *not* cryptographically unbreakable against a sufficiently
   skilled attacker with physical access to the machine, since the app
   itself must be able to derive the key without the user retyping a
   master secret on every launch. **Named, concrete limitation now that
   this is built:** the key is tied to the Windows profile via
   `safeStorage`/DPAPI, not to a GymOS password — if the machine is
   reimaged or the profile recreated, the wrapped key becomes permanently
   undecryptable, and since there's no sync-out yet (§15.4), anything
   entered offline and not otherwise backed up is lost in that scenario.
   Pairing with OS-level full-disk encryption (BitLocker) is the
   recommended complement, not a substitute.

4. **Sync engine — push and pull (Milestones 1–3) all DONE.**

   **Push (done):** on sign-in with a resolved `gym_id` (same hook point as
   `ensureBootstrapped`, right after it, in `src/auth.jsx`),
   `src/data/local/sync.js`'s `pushPendingChanges(gymId)` reads everything
   locally `sync_status: 'pending'` (via new IPC ops in
   `electron/local-db/sync.cjs`) and writes it to Firestore — the 5 FACT
   tables and `members` as `writeBatch`/transaction creates (chunked at
   400 ops), `plans`/`custom_fields`/`users` as merge-writes (edits to
   existing docs, not fresh creates), tombstoned `custom_fields` deletes
   via `deleteDoc`. Only flips `sync_status: 'synced'` locally after
   Firestore confirms the write landed — never optimistically before. A
   failed chunk/record is logged and left `'pending'` for the next cycle
   rather than aborting the whole push.

   Three things had to be fixed as prerequisites, found by actually
   tracing the code rather than assumed: (a) none of the existing local
   UPDATE functions (`updatePlan`, `setUserActive`, etc.) touched
   `sync_status` — fixed, they all set `'pending'` now; (b)
   `deleteCustomField` is a real hard `DELETE`, leaving nothing behind to
   flag `'pending'` — fixed with a `pending_deletes` tombstone table
   (schema v2); (c) the 5 FACT collections' `firestore.rules` required
   `actor_uid`/`receptionist_uid` to match whoever's *currently* signed
   in, which would permanently reject a record queued by one receptionist
   and pushed after a shift change — fixed by dropping that check
   (matches `members`' own create rule, which already had none). Accepted
   tradeoff: a signed-in receptionist could misattribute a record to a
   different uid within the same gym. **This rules change needs a manual
   publish in the Firebase Console to take effect (BUILD.md §3) — editing
   the file alone does nothing live, and this specifically could not be
   verified from the sandbox this was built in.**

   Members are pushed individually (existence-check first, then the same
   transactional `member_seq` pattern the web's own `createMember`
   already uses) rather than batched, since `member_no` is recomputed
   from Firestore's own counter on push — if it differs from what was
   assigned offline (another device's create landed first), the local row
   is corrected to match via a new `applyMemberRenumber` operation, rather
   than trusting two independent counters to agree.

   **Pull — Milestone 1 (entity refetch) DONE; Milestone 2 (cursor-based
   FACT/member pull) and Milestone 3 (sync triggers) not started.**

   Designing pull meant re-reading push/bootstrap's code path-by-path
   (push's own standalone-`node` verification only ever calls
   `electron/local-db/*.cjs` with plain JS objects — it can't exercise a
   real IPC structured-clone or the real `auth.jsx` React lifecycle).
   Doing so surfaced **four real, confirmed bugs already in shipped
   Phase 2/3 code**, fixed as prerequisites before pull could safely be
   built on top of them (pull's entity refetch reuses those exact code
   paths):
   - `logic/license.js`'s `isPastGrace`/`isInGrace`/`daysRemaining` did
     `expiryDate instanceof Date ? expiryDate : expiryDate.toDate()` — a
     plain ISO string (what local SQLite actually returns) has no
     `.toDate()`, so any gym with a subscription crashed Desk/Owner on
     first render. Fixed: use `lib/helpers.js`'s existing polymorphic
     `toDate()`.
   - First-ever Electron sign-in on an empty local DB deadlocked
     permanently: `watchUserRecord`'s local branch found nothing on an
     empty DB and reported `noAccount`, but `ensureBootstrapped` (the only
     thing that populates local `users`) only ran once a real account was
     already known — circular. Fixed: `data/accounts.js`'s
     `watchUserRecord` now falls back to one direct Firestore read when
     the local lookup comes back empty, breaking the cycle.
   - An Owner's own account could never be seeded locally even after that
     fix — `bootstrap.js`'s `fetchStaff` queried `role == "receptionist"`
     only. Fixed: widened to every user in the gym (`listStaff`'s local
     counterpart already re-filters for display, so nothing downstream
     broke) — the same query pull's own user refetch needed anyway.
   - Bootstrap silently no-op'd for every real gym over real IPC:
     `bootstrap.js` spread live Firestore `Timestamp` instances into the
     bundle handed to `localInvoke(...)`; Electron's structured-clone
     strips a class instance's prototype methods (including
     `Timestamp.prototype.toDate`), so the main process received
     something `better-sqlite3` couldn't bind, thrown and silently
     swallowed by `ensureBootstrapped`'s own try/catch. Fixed: every
     Timestamp is now converted to an ISO string in the renderer, before
     the IPC call — centralized in the new `src/data/local/timestamps.js`
     (also fixed a real second bug found while centralizing it:
     `sync.js`'s own local copy of this field map omitted `members`,
     so pushing an offline-created member would have thrown iterating
     `undefined`).

   A fifth bug was caught by pull's own verification script, not by
   tracing: `applyPulledCustomFields`'s prune step built its `NOT IN
   (...)` clause as `NOT IN (NULL)` when a gym's custom-fields list came
   back completely empty — SQL's `NOT IN` against a NULL is
   unknown/false for every row, so a gym pulled back with zero remaining
   custom fields would never actually prune any of its stale local ones.
   Fixed by omitting the `NOT IN` clause entirely in that case (every
   local non-pending row for the gym is then stale, full stop).

   **What Milestone 1 builds:** `src/data/local/pull.js` (renderer) +
   `electron/local-db/pull.cjs` (main) — a new file pair, not folded into
   `sync.js`/`sync.cjs` (different direction, different shape). `auth.jsx`
   now sequences all three background effects on sign-in:
   `ensureBootstrapped` → `pushPendingChanges` → `pullRemoteChanges`, in
   that order — pull must run after push, never before, since its
   local-always-wins conflict policy only holds if a locally-pending row
   already had its chance to reach Firestore first. The gym doc is always
   fetched and applied first, with an early exit: `firestore.rules` gates
   `plans`/`custom_fields`/`members` reads behind `gymIsOperational()`
   (the gym doc itself and `users` have no such gate), so the rest of the
   cycle is skipped once the gym comes back suspended/locked — both
   to avoid a wall of spurious `permission-denied` errors and because
   getting the corrected gym row applied (+ its `emitGymChanged`) first is
   the actual mechanism that closes the motivating gap: a super-admin
   suspending a gym while an Owner/Desk session sits open offline now
   reaches that session on the next pull cycle, the same way an
   `onSnapshot` listener would on the web. Each of the four entity
   collections (`gyms`, `plans`, `custom_fields`, `users`) is fetched and
   applied independently, in its own transaction — one failing doesn't
   block the other three, same per-table independence push's own
   `pushFactTable`/`pushEntityTable` established. Every apply is one
   `INSERT ... ON CONFLICT(id) DO UPDATE ... WHERE sync_status !=
   'pending'` statement — the single-statement expression of the
   local-always-wins policy (insert if new, overwrite-and-mark-synced if
   not locally dirty, leave completely untouched if still `'pending'`).
   `custom_fields` additionally prunes any local non-pending row absent
   from the freshly-fetched set (the one entity with a real hard-delete
   path). `bootstrap.js` now also seeds every table's starting
   `sync_meta` pull cursor (captured just before its Firestore fetches
   begin) so Milestone 2's first real cursor pull doesn't need to
   re-fetch a gym's entire history.

   **Milestone 2 — cursor-based FACT/member pull, DONE.** The 5 FACT
   tables (`payments`/`attendance`/`membership_records`/
   `equipment_records`/`activity_log`) are append-only everywhere (never
   updated after creation, in Firestore or locally), so their pull
   conflict policy collapses to a plain `INSERT OR IGNORE` keyed on `id`
   — no `sync_status` guard needed the way Milestone 1's mutable entities
   require, since an id is either new (insert) or already present
   (harmless to ignore). `electron/local-db/pull.cjs`'s new
   `applyPulledFactPage(db, {table, rows})` builds that INSERT from
   `ledger.cjs`'s existing `FACT_TABLES` metadata (columns + the one
   `for`→`for_type` rename) rather than a third duplicate column map —
   the same kind of duplicate map that caused one of Milestone 1's five
   confirmed bugs. `members` is create-only too but carries a second,
   device-independent constraint no FACT table has:
   `UNIQUE(gym_id, member_no)`. A pulled member can rarely collide with a
   member this device created offline (a guessed `member_no`) and hasn't
   yet pushed — `applyPulledMembersPage` catches that specific constraint
   violation per-row (a plain `INSERT`, not `OR IGNORE`, so the violation
   is visible) and stops advancing that table's cursor right there; the
   next cycle retries once this device's own conflicting push (which
   always runs before pull, every cycle) has corrected the local number
   via the already-built `applyMemberRenumber`. Self-healing, not a
   data-loss case — verified directly (see below).

   New `electron/local-db/syncMeta.cjs` centralizes all `sync_meta`
   reads/writes: `getPullCursors`/`setPullCursor` (namespaced
   `cursor:<table>`, one per FACT table + members) and — grouped here
   because it's the same table, not the same feature —
   `advanceForwardClock`, Phase 4's forward-only clock anchor (below).
   `src/data/local/pull.js`'s new `pullFactAndMembers(gymId)` reads every
   table's cursor once, then per table independently: fetches one page
   (`where('gym_id','==',gymId)` + `where('created_at','>=',cursor)` +
   `orderBy('created_at')` + `limit(400)`, cursor omitted on a table's
   first-ever pull), applies it, advances that table's cursor to how far
   the apply actually got. One table erroring doesn't block the others —
   same per-table independence as push and Milestone 1. One page per
   table per cycle by design; a large backlog catches up over several
   cycles (Milestone 3's triggers, below), not in one shot, matching how
   push already treats a big pending queue.

   **Required manual step, same weight as the rules-publish note above:**
   this is the first query in the codebase combining an equality filter
   with a range/orderBy on a different field — Firestore requires a
   composite index for that. **Six indexes needed**, `(gym_id ASC,
   created_at ASC)` on `payments`, `attendance`, `membership_records`,
   `equipment_records`, `activity_log`, `members`. A new
   `firestore.indexes.json` at the repo root now defines all six, ready
   for `firebase deploy --only firestore:indexes` (or manual entry via
   the Firebase Console) — **cannot be deployed or verified from this
   sandbox** (no Firebase CLI auth here); until deployed, these six pull
   queries will throw on first run (Firestore's error includes a
   Console link to create the missing index on the spot, as a fallback).

   **Milestone 3 — sync triggers, DONE.** Centralized in `src/auth.jsx`'s
   `AuthProvider` rather than a new context provider or touching the (four
   duplicated, no-shared-Shell-component) role shells more than needed. A
   `runSyncCycle(gymId)` now runs: `pushPendingChanges` →
   `pullRemoteChanges` (Milestone 1) → `pullFactAndMembers` (Milestone 2)
   → `getPendingCount` (new tiny op in `sync.cjs`, sums the lengths of the
   already-existing `getPendingFactRows`/`getPendingEntityRows`/
   `getPendingDeletes` — no new SQL). It runs once after
   `ensureBootstrapped` on sign-in, **every hour** via `setInterval`
   (Electron only — widened from an original 5 minutes, per explicit
   request once the result popup below made the cadence something a desk
   would actually notice, not just a silent background detail), on the
   browser's `online` event (Electron only — a real signal, not polling,
   still fires regardless of the hourly interval), and on demand via a
   `syncNow()` exposed through `useAuth()`. `syncStatus`/`lastSyncedAt`/
   `pendingCount`/`syncNow` are all on `AuthProvider`'s context value.

   **UI:** `DeskHome.jsx` and `OwnerDashboard.jsx`'s existing
   `.sidebar__actions` row (where `ThemeToggle`/settings/sign-out
   icon-buttons already lived) each got one new icon-button, rendered
   only when `window.gymOS?.isElectron` — the already-unused `IconSync`
   from `components/NavIcons.jsx`, reusing the existing `.btn.btn--icon`
   class, spinning (new `.sidebar__sync--spinning` keyframe in
   `index.css`) while a cycle runs, `title`/`aria-label` summarizing
   state ("3 pending changes — tap to sync now" / "Synced — tap to sync
   now" / "Sync failed — will retry automatically"), `onClick={syncNow}`.
   No numeric badge overlay — kept to the same title/aria-label-only
   pattern the adjacent buttons already use.

   **Manual-sync result popup (new `src/components/SyncToast.jsx`),
   deliberately manual-only.** `runSyncCycle` now takes a `manual` flag
   (only `syncNow()` passes it); only then does it set a `syncToast`
   state (`AuthProvider`, rendered as a sibling of `children` so it works
   from any screen without touching either shell file again) — a
   bottom-right popup, auto-dismissing after ~4.5s or on click, green
   ("Synced successfully") or red ("Sync failed — will retry
   automatically") using the existing `--accent`/`--bad` tokens (the same
   ones `.form-error` and the dashboard stat-card dots already use, not
   new colors). The automatic paths (hourly interval, reconnect, the
   post-bootstrap first cycle) never pass `manual` and so never trigger
   the popup — explicit choice: a desk shouldn't get interrupted by a
   popup every hour regardless of outcome, only when THEY asked for one
   via the sync button, success or failure either way.

   **Verification note (same limitation as Milestone 1, worth repeating):**
   this sandbox can't launch real Electron. A standalone `node` script
   covers `applyPulledFactPage` (OR-IGNORE dedup across a page-boundary
   overlap, the `for`→`for_type` rename), `applyPulledMembersPage`
   (insert-new, idempotent id-overlap, the `UNIQUE(gym_id, member_no)`
   collision path correctly halting cursor advancement and then
   self-healing on retry), `syncMeta.cjs`'s cursor roundtrip, and
   `advanceForwardClock`'s monotonic behavior (rejects an earlier `now`)
   — all passing. What that script can't reach: `auth.jsx`'s new
   `setInterval`/`online`-listener effects (real `window` events, real
   React lifecycle, cleanup-on-unmount) and a real IPC round-trip for any
   of this — only a real Windows run can confirm those, plus a genuine
   large FACT backlog actually catching up over several real sync cycles,
   and the six Firestore indexes above once deployed.

5. **Offline license enforcement — DONE (Option A, real gate, Electron
   only).** BUILD.md §13's design, now actually wired up instead of just
   documented. New `src/data/local/clock.js`'s `advanceForwardClock(gymId)`
   — a no-op returning the raw wall clock outside Electron; in Electron,
   calls the new `advanceForwardClock` IPC op (`syncMeta.cjs`, above) with
   the current time and returns the persisted, monotonic winner. In
   `AuthProvider`: a `licenseNow` state refreshed once when `gym.id`
   resolves and every 60s after (Electron only, so a long-open offline
   session that crosses the grace boundary locks without needing a
   restart). `isLocked = !!gym && (status === "locked" || (isElectron &&
   status === "expired"))`, where `status = licenseStatus(gym, isElectron
   ? licenseNow : new Date())`. Web behavior is byte-for-byte unchanged —
   still only gates on `"locked"`, raw wall clock, exactly as before (the
   server is the real gate there). Electron additionally gates on
   `"expired"` (past grace) — the literal §13 spec ("self-locks 24h after
   it passes") — using the forward-only clock so a rolled-back system
   clock can't be used to dodge it. `"grace"` (past expiry, still inside
   the 24h window) intentionally does not lock, on either platform.
   `DeskHome.jsx`/`OwnerDashboard.jsx` now both just read `isLocked` from
   `useAuth()` instead of each computing `licenseStatus(gym) === "locked"`
   locally — one behavior, computed once. `LockedScreen` itself needed no
   changes; its existing generic "subscription expired... contact your
   provider" copy already covers this case correctly.

   **Explicitly not built, same deliberate-deferral treatment as native
   fingerprint hardware:** the signed-license server (§13) — private key
   custody, a `server/` that signs licenses, desk verifying against a
   bundled public key. Option A raises the bar from "purely cosmetic
   display" to "the app actually stops working once locally-known data
   says the grace period passed, and a rolled-back clock can't trivially
   bypass that" — it does **not** defend against someone editing the
   local SQLite file directly (same documented threat-model boundary as
   §15.3's encryption-at-rest scoping note). That remains real, separate,
   future infrastructure work — this project has no server component at
   all today.

6. **Offline authentication + idle auto-logout — DONE.** Decided directly
   by the user, superseding this section's own former "not decided yet"
   note below: after a gym's first-ever online login (unchanged —
   bootstrap), any staff member of that gym should be able to sign in
   **offline** on that device, including signing out and back in while
   offline, capped at 14 days since that person's last online sign-in
   there. Plus: 30-minute idle auto-logout, on **every** platform and
   role (the user's explicit choice — this also changes the live web
   app's session behavior, not just Electron's).

   **The necessary, honestly-stated caveat:** Firebase never exposes
   password hashes to any client, so there is no way to pre-authorize a
   gym's whole staff for offline access from just one person's login.
   Each staff member's own offline sign-in only activates the moment
   **they personally** complete a real online sign-in on that specific
   device — after that, they can sign out and back in offline freely.

   **Mechanism (Electron only — `electron/local-db/credentials.cjs`,
   new):** on every successful *online* Firebase sign-in, the plaintext
   password (the only moment it's ever available) is hashed with Node's
   built-in `crypto.scrypt` (salted, `crypto.timingSafeEqual` compare —
   no new dependency, no second native module, a real consideration
   after this same session's `better-sqlite3-multiple-ciphers` build-
   tooling detour) and stored in a new `local_credentials` table (schema
   v3) — deliberately separate from `users`, which flows through the
   generic sync/push machinery (`ALL_TABLES` in `sync.cjs` etc.); keeping
   password material in a table those lists never mention makes "a hash
   accidentally reaches Firestore" structurally impossible, not just
   unlikely. `src/data/accounts.js`'s `signInWithUsername` always tries
   the real Firebase sign-in first (needed both to confirm the password
   is current and to get a real Firestore-authorized session for sync);
   only on a network-shaped failure, in Electron, does it fall back to a
   local `verifyCredential` check. The 14-day freshness check reuses the
   **same** forward-only clock already built for Phase 4 license
   enforcement (`syncMeta.cjs`'s `advanceForwardClock`) rather than a
   second clock-trust mechanism — a rolled-back system clock can't extend
   offline access either, for the same reason it can't dodge a
   subscription lockout.

   **Second real-device finding this pass (after the `BrowserRouter`/
   `file://` bug above): Electron's whole notion of "am I signed in" used
   to depend on Firebase Auth's own `onAuthStateChanged`/persistence** —
   exactly what a live tester hit as a reproducible `auth/network-
   request-failed` after losing connectivity mid-session, without ever
   explicitly signing out. Building the offline-login capability above
   also fixes this properly rather than patching around it: a new
   `local_session` table (schema v3) is now Electron's actual source of
   truth for the signed-in user, watched via a third `EventEmitter` in
   `watchers.cjs` (`watchLocalSession`, mirroring `watchUser`/
   `watchGymRecord` exactly) and a matching `local-db:watch-session` IPC
   pair in `main.cjs`/`preload.cjs`. `accounts.js`'s `watchAuth` branches:
   Electron watches `local_session`; web keeps `onAuthStateChanged`,
   byte-for-byte unchanged. Whatever Firebase's own session state does on
   a network blip no longer matters to Electron's UI — sign-in/out is
   fully self-contained in local SQLite there now.

   **Explicit follow-up request: closing the app signs out.** `local_session`
   surviving a restart (needed for "stay signed in across a normal
   offline session") turned out to be the wrong default for a shared
   desk device specifically — reopening the app was silently resuming
   whoever signed in last, the same "someone sees the account still
   open" risk the 30-minute idle-timeout already exists to guard
   against, just triggered by closing the app instead of by sitting
   idle. Fixed in `electron/main.cjs`: `app.on("before-quit", ...)`
   clears `local_session` directly (main-process-side, the same
   connection `registerLocalDb()` already opened, no IPC round trip
   needed) — fires reliably on every real quit path (closing the window,
   OS shutdown/logoff), but *not* on minimize, matching "closed"
   specifically. A within-session restart is still unaffected — this
   only ever fires once the app is actually exiting.

   **Idle auto-logout (`src/hooks/useIdleTimeout.js`, new):** resets a
   30-minute timer on `mousemove`/`keydown`/`click`/`scroll`/`touchstart`,
   wired into `AuthProvider` (`src/auth.jsx`) whenever `status ===
   "ready"`. A plain `setTimeout` alone can't catch a laptop that *slept*
   through the window (timers don't run while the OS suspends the
   process, but wall-clock time keeps passing) — the actual concern here
   ("someone left the account open, walked away, the laptop slept,
   someone else opens it later") is caught by persisting the last-
   activity timestamp (`localStorage` on web; Electron additionally
   mirrors it into `local_session.last_activity_at`, via a new
   `touchLocalSessionActivity` op) and re-checking elapsed time on
   `visibilitychange`/window `focus`, not by the timer alone.

   **Sync implication, stated plainly (not silently papered over):** a
   session established via the offline-verification path has no real
   `auth.currentUser` — Firestore rejects unauthenticated requests, so
   anything created during it queues locally exactly like any offline-
   created record already does, but won't reach Firestore until a
   *future* online sign-in re-establishes a real Firebase session.

   **Third real-device finding, two confirmed bugs, both fixed:**
   (1) `signInWithUsername`'s network-error detection originally also
   treated `!navigator.onLine` as grounds to try local verification —
   too broad: that flag can be stale, and a **genuine wrong password**
   (a real, definitive rejection from Firebase, not a network problem)
   could then get silently retried against local verification instead of
   simply reported as wrong. Fixed by narrowing the check to exactly
   `err.code === "auth/network-request-failed"`, Firebase's own specific
   signal that the request never reached the server — nothing else
   triggers the local path now. (2) `accounts.js`'s `changeOwnPassword`
   (the forced first-login password change) always wrote the cleared
   `must_change_password` flag to Firestore only. Fine on the web, where
   `watchUserRecord`'s live `onSnapshot` picks it up immediately — but in
   Electron, `watchUserRecord` reads from LOCAL SQLite once signed in
   (§15 offline-auth's own local-session-driven flow), and nothing
   mirrored this one write down into it. A brand-new receptionist
   signing in with their temp password for the first time would set a
   new password successfully, have it genuinely saved, and then watch
   `SetPasswordPage` reappear indefinitely anyway — the local copy never
   found out. Fixed with a new `clearMustChangePassword` op
   (`electron/local-db/users.cjs`), called right after the Firestore
   write succeeds; stays `sync_status: 'synced'` (not `'pending'`) since
   Firestore already has it — this mirrors an already-done online write,
   it doesn't queue a new one.

   **Verification note (same limitation as every prior phase):**
   verified via a standalone `node` script — hash/verify roundtrip
   (correct + wrong password), password never stored in plaintext,
   re-capture on a later sign-in correctly invalidates the old password,
   the 30-day expiry boundary against the shared forward-only clock (and
   that it degrades to never-expiring rather than throwing for a
   gym_id-less credential, an edge case outside this feature's intended
   roles), `local_session` set/get/clear/touch and its watcher firing
   correctly — all passing. What only a real device can confirm: the
   actual offline sign-in/out UX end to end, the 14-day and 30-minute
   boundaries over real elapsed time, and specifically the sleep/lid-
   close → reopen → immediate-logout behavior.

7. **Member bio-data editing (Desk) + receptionist contact editing
   (Owner) — DONE.** Both were already granted by `firestore.rules` and
   `src/data/{users,members}.js` (see §7's permission table note) before
   either screen actually had a button for it — this pass built the UI to
   match: `StaffProfile.jsx` gets an "Edit contact info" toggle (phone/
   email, reusing the exact `setUserPhone`/`setUserEmail` calls
   `GymDetailPage.jsx`'s `PersonDetailModal` already used for
   super-admin — same capability, now also on the owner's own page) and
   `MemberProfile.jsx` gets an "Edit details" toggle (Desk only, matching
   its own existing "owners have R-only on members" note) covering name/
   phone/gender/dob/weight/height/emergency contact/address/email — never
   `member_no`/`gym_id`/`active`/anything transactional. New `updateMember`
   (`src/data/members.js` + `electron/local-db/members.cjs`, the latter
   following `updatePlan`'s established "read current row, fall back to
   `current.field` per-field on `undefined`, single UPDATE +
   `sync_status='pending'`" pattern exactly). `firestore.rules`' member
   `allow update` gained an explicit `affectedKeys().hasOnly([...bio-data
   fields])` allow-list at the same time — no longer "permitted by the
   rule's absence of a restriction," an explicit one, so a direct API call
   can't touch anything this UI doesn't.

   **Two more confirmed bugs found designing this, both fixed, neither
   reachable without deliberately tracing every path an EDIT (not a
   create) to an already-synced member takes:**
   (1) `src/data/local/sync.js`'s `pushMembers` — written for Phase 3
   push, only ever exercised by *creating* members offline until now —
   treated "this member id already exists in Firestore" as "nothing to
   do but mark synced," full stop. That's correct for a create that
   already landed on a prior cycle, but wrong for an EDIT to a member
   Firestore already had: the local `sync_status='pending'` edit
   (name/phone/etc.) would get silently marked `'synced'` without the
   actual field changes ever reaching Firestore — a real data-loss bug
   for exactly the feature this pass adds. Fixed: that branch now
   merge-writes the current local fields first (same `merge: true`
   treatment `pushEntityTable` already gives plans/custom_fields/users
   edits), *then* marks synced. (2) That merge-write deliberately
   excludes `created_at`/`date_joined` — round-tripping a Firestore
   `Timestamp` through local SQLite as a millisecond-precision ISO string
   and back can land a fraction of a millisecond off the original
   server-assigned value even though "nothing really changed," which
   would trip the new `affectedKeys()` allow-list above (neither field is
   in it) and reject the entire write over a phantom diff. Neither field
   should ever legitimately change on a bio-data edit, so the simplest
   correct fix is to never resend them, not to loosen the rule.

   **Verification note (same limitation as every prior phase):** verified
   via a standalone `node` script — `updateMember`'s partial-update
   semantics (only touch what's passed, `undefined` leaves a field
   alone), clearing a field to empty/null (weight, custom_fields),
   `member_no`/`gym_id` staying fixed no matter what, `sync_status`
   flipping to `'pending'`, and updating a non-existent id throwing
   clearly — all passing. What only a real device (and a real Firestore
   read of the deployed rules — **the `firestore.rules` change here needs
   the same manual Console publish every prior rules change has needed,
   still not done or verifiable from this sandbox**) can confirm: the
   actual edit-then-sync round trip end to end, and that the
   `affectedKeys()` allow-list doesn't reject a legitimate edit in
   practice the way the `created_at`/`date_joined` finding above shows it
   plausibly could have.

**Deliberately deferred, not forgotten:** native fingerprint hardware
integration (a later update, per the user — everything else in this
section is done) and the signed-license server (§13). Offline *login*
from a device that has never once logged in online (true cold start,
zero staff members ever signed in there) is still correctly refused —
there is nothing local to check credentials against — that's expected,
not a gap: see item 6 above for the now-decided, now-built design of
everything else offline auth covers. **Not decided/not designed yet,
flagged so they aren't assumed:** auto-update; code signing for real
distribution.

---

## 16. Verification workflow

There is no automated test suite. The established practice for any UI change
this session:

1. Build for real (`npx vite build`) after every meaningful edit — catches
   syntax/import errors immediately, cheaper than a browser round-trip.
2. For anything needing visual/interactive confirmation: stand up a temporary
   mocked preview — a `dev-preview.html` + `dev-preview-main.jsx` at the repo
   root mounting just the shell/page under test, wired via a **temporary**
   `resolve.alias` in `vite.config.js` that redirects that file's `../data`
   and `../auth` imports to hand-written `devmock-data.js` /
   `devmock-auth.jsx` stubs (no real Firebase calls). Drive it with
   Playwright (screenshots + DOM assertions), covering the actual light/dark
   themes and both a desktop and a ~375px mobile viewport where layout is in
   question.
   - **Gotcha:** a shell component (e.g. `AdminDashboard.jsx`) statically
     imports every sibling page it routes to, so the mock data file must
     export EVERY name any of them import from `../../data` — not just the
     one page being tested — or the whole bundle fails to load with a
     "does not provide an export named X" error.
   - **Gotcha:** Playwright's own `locator.click()` occasionally misfires on
     elements whose surrounding layout just changed (observed a couple of
     times this session as a click silently landing on the wrong thing or
     hanging). If a click doesn't seem to register, retry via
     `page.evaluate(() => el.click())` (a raw DOM click) before assuming the
     app is broken — verify against that before spending time debugging
     application code.
   - **Gotcha:** if the preview is mounted under a `MemoryRouter` (its
     `initialEntries` read once from `window.location.hash` at first load),
     navigating between test scenarios by changing only the URL's hash does
     NOT reload the app — browsers treat a hash-only URL change as a
     same-document navigation, so the SPA silently keeps showing whatever it
     already had mounted, and the script ends up interacting with the wrong
     screen. Force a real reload between scenarios (e.g. `page.goto("about:
     blank")` before each new target URL).
   - **Gotcha:** a hand-written mock's mutation functions (`createX`) must
     snake_case their fields the same way the real `appendRecord`-based
     function does (e.g. `paymentId` → `payment_id`), not just spread the
     JS-camelCase payload verbatim — otherwise app logic that reads the
     snake_case field back out of a freshly-created mock record (e.g.
     matching an `equipment_records.payment_id` against a `payments.id`)
     silently fails, and it looks exactly like an application bug until you
     compare the mock against the real `src/data/*.js` implementation it's
     standing in for.
3. **Always clean up afterward**, in every case: kill the dev server, delete
   the mock/preview files, revert `vite.config.js`, delete scratch
   screenshots, and finish with one more real `npx vite build` (then remove
   its `dist/`) to confirm the repo is left exactly as it should ship.
4. A firestore.rules change needs a manual publish step to take effect against
   the real database — see §3's note on this; the mocked preview workflow
   above never touches real Firestore rules at all, so it can't catch a rules
   bug, only a client-code bug.
5. **`release/` is stale until you rebuild — nothing regenerates it
   automatically.** `npx vite build` only writes `dist/` (the web bundle);
   the installer and the unpacked app in `release/` are produced solely by
   `npm run electron:build`. This has already caused one real false alarm:
   the logo work in §19 was reported as "not applied to Electron" when the
   code was in fact correct — the installer being tested was 25 days old.
   **Before testing anything in the desktop app, check the timestamp on
   `release/GymOS Setup <version>.exe` against the files you changed.** The
   filename carries the app version, not a build date, so a rebuilt
   installer is byte-different but identically named — the timestamp is the
   only thing that tells them apart. This matters most when copying an
   installer to another machine to test.

---

## 17. Public marketing website

A separate, public-facing site — Home / Product / Pricing / Contact — lives
alongside the app itself and shares its auth/router, but is content
otherwise unrelated to gym operations. Built from a Stitch export the user
dropped in `Downloads/GymOS Website` (4 zip files, one screen each).

**Translation approach, agreed with the user before building:** take
Stitch's content structure and marketing-specific UX patterns (hero /
feature-grid / pricing-card / split-section / footer — layouts the
dashboard never needed); override every visual value with GymOS's own
design system (`--accent` green not Stitch's blue, Inter, the real
`Logo.jsx` + `.topbar__brand-name`/`-accent` wordmark treatment, the
existing `--radius-*`/`--shadow-*` tokens) rather than Tailwind utility
classes. New CSS lives in its own `.site-*` namespace in `index.css` — the
*layout* patterns (3-column grids, hero split, sticky nav) genuinely differ
from the single-column dashboard — but the **card identity was later
brought in line with `.card`'s own** (see the update below): no per-card
box/background/shadow, a hairline group border with dividers between items,
an "incomplete line" (a border-bottom under just the heading) standing in
for the box. Where the site legitimately shows the real product UI, it
reuses the real `.verdict`/`.stat-card`/`.pill`/`.table` classes verbatim
(Product page's verdict demo).

**Files:**
- `src/components/website/WebsiteHeader.jsx` / `WebsiteFooter.jsx` /
  `WebsiteLayout.jsx` — sticky nav (Home/Product/Pricing/Contact +
  ThemeToggle + Sign in), footer with the same nav repeated + copyright.
  Mobile nav collapses behind a burger under 760px (CSS `max-height`
  toggle, no animation library).
- `src/components/website/WebsiteIcons.jsx` — small site-only icons (bolt,
  desk, handshake, block, arrow, check) in the same 24px/currentColor/
  stroke style as `components/NavIcons.jsx`. `IconHandshake`/`IconBlock` are
  currently unused (Affiliate/Admin portal cards and the "Two independent
  clocks" section were dropped, see the update below) but kept in the file
  since it's a shared icon set, not per-page code.
- `src/features/website/{MarketingHome,Product,Pricing,Contact}.jsx` — the
  four pages.

**Routing (`App.jsx`):** `/login`, `/product`, `/pricing`, `/contact` are
new top-level routes. `Home()` (the `"*"` catch-all) now branches on
`window.gymOS?.isElectron`: Electron keeps its exact original behavior
(signed-out → `LoginPage` directly at `/`, since it's a locally installed
app for existing customers with no navbar to reach a marketing site
through anyway); web shows `MarketingHome` instead, with sign-in moved to
its own `/login`. Nothing about the role-gated `/desk`, `/owner`, `/admin`,
`/affiliate` routes or `RequireRole` changed.

**Content deliberately changed from the Stitch export, and why (fabricated
claims were not shipped even though the layout was kept):**
- Dropped the "NEW: BIOMETRIC ENTRY SYSTEM" hero eyebrow — no biometric
  hardware integration exists or is even started (§14 confirms this is
  explicitly deferred). Replaced with "NEW: WORKS FULLY OFFLINE," which is
  both real and a genuine differentiator (§15).
- Dropped "Watch Demo" — no demo video exists; a button that opens nothing
  is worse than not having it.
- Dropped the "Trusted by 2,000 facilities" fake-customer-logo strip
  (IRONWORKS / PEAK ATHLETICS / VELOCITY / LIFT INC) — specific, named,
  quantified social proof that isn't real. Nothing replaced it; the page
  goes straight from hero to the feature grid.
- Dropped the Contact page's "Direct Contact" card (placeholder
  `hello@gymos.com` + a San Francisco address — inconsistent with the
  Naira pricing on the very next page, a clear sign it was unedited Stitch
  template filler, not real GymOS info). Per the user: leave it out for
  now, add real contact details later.
- Dropped the footer's Privacy Policy / Terms of Service / About links —
  those pages don't exist; a link to a fabricated legal page is worse than
  no link.
- Pricing page's plan names, ₦ figures, and feature bullets were originally
  kept **verbatim** from the Stitch export. **Since superseded** — see the
  update below; pricing is now super-admin-managed data, not hardcoded copy.
- Product page's "Dual-Status Clock" section was renamed "Two independent
  clocks" and its copy corrected to the actual two clocks the app tracks —
  **Membership** and **Equipment** (see `EntryVerdict.jsx` / `logic/
  entry.js`) — not Stitch's generic "Financial / Access" framing. **Since
  removed from the Product page** (see the update below) — the homepage's
  own feature grid still has a "Two independent clocks" card.

**Contact form has no backend** — by the user's explicit choice (asked
directly rather than assumed): it's UI only for now. `onSubmit` just calls
`preventDefault()`; nothing is sent anywhere, no Firestore collection, no
email service. Wiring it up (mailto vs. a new `contact_requests` Firestore
collection vs. a real mail service) is a future task, not started.

**Update (2026-08-28) — card identity unified with the app, dynamic
pricing, copy cleanup:**
- **Cards now match the app's own card identity** instead of Stitch's boxed
  look, dropping individual border+background+shadow — revised once already
  (2026-08-28, same day): the first pass used a hairline-bordered outer
  group with `border-left` dividers, but the user pointed at the real
  `.stat-card` (GymDetailPage's attendance/members/staff row) as the actual
  reference. **Final technique**: `.site-feature-card`/`.site-pricing-card`
  each get `border-left: 1px solid var(--border)` + a full `border-radius`
  — applied to EVERY card, including the first, no first-child exception
  (same as `.stat-card`'s own comment explains) — so the radius only has
  one bordered side to curve, reading as a soft bracket rather than a flat
  rule. No outer box around the row at all. `.site-contact-card` (a lone
  card with no row of peers) instead matches plain `.card`: no border
  whatsoever, just the heading border-bottom. Every card's heading keeps
  that border-bottom (the "incomplete line" — a partial line standing in
  for the box, exactly like `.card h2`'s own underline). The featured
  pricing tier is called out with an accent-coloured heading underline + a
  soft `rgba(accent, 0.04)` tint instead of a border/shadow of its own — a
  card never gets its own box back, even for emphasis.
- **`GymDetailPage.jsx`**: added `section-top` to the `.stat-grid` div so
  the attendance/members/staff cards get breathing room below the gym's
  address/country line instead of sitting flush against it (same utility
  class `RegisterMember.jsx`/`GymSettings.jsx`/`MemberProfile.jsx` already
  use for this).
- **Hero visual is now a real screenshot**, not a fabricated mockup —
  `DashboardPreview.jsx` (deleted) is replaced by `HeroPreview` inlined in
  `MarketingHome.jsx`, an `<img src="/dashboard-screenshot.png">` inside the
  existing browser-chrome frame. The user drops the actual file into
  `public/` manually (not committed by this change). `onError` swaps to a
  plain-text placeholder ("Drop a screenshot into public/dashboard-
  screenshot.png") instead of a broken-image icon until they do.
- **Pricing is now super-admin-managed data**, not hardcoded — via a
  dedicated `platform_settings/website_pricing` document and
  `Settings.jsx`'s "Website pricing" card. **Superseded the very next
  day (2026-08-29) — see that update below**: the user wanted the public
  pricing tiers and the internal `platform_plans` (what a gym pays the
  platform) to be the literal same object, since a prospect picks a tier on
  the website and the super admin later assigns their gym to that exact
  plan. `website_pricing` and `src/data/websitePricing.js` no longer exist;
  `Pricing.jsx` now reads `platform_plans` directly. Left in this entry for
  history, not as current behavior.
- **Product page's role-based portals trimmed to Owner + Receptionist** —
  Affiliate and Admin cards dropped from `PORTALS`, and the "Two independent
  clocks" section removed entirely from this page (marketing simplification
  only; the app's actual affiliate/admin roles and the dual-clock system
  are unchanged — see §6/§12/§13. The homepage's own feature grid still
  describes "Two independent clocks" as a product feature).
- **Tagline "Run your gym smarter" placed as the homepage hero eyebrow** —
  reused the existing (previously unused) `.site-eyebrow` pill class above
  the `<h1>` in `MarketingHome.jsx`, rather than adding new CSS.
  **Superseded 2026-09-04 (§19)** — the eyebrow pill was removed; the
  tagline is now its own full-width statement section.
- **Dash/hyphen cleanup across the site's copy** — several feature/portal
  descriptions and the hero subhead over-used em dashes as filler
  punctuation (flagged by the user, e.g. "speed — search-and-verdict...").
  Rewritten with periods, commas, or colons where the dash was doing the
  job of ordinary punctuation; genuine compound words (`front-desk`,
  `search-and-verdict`, `go / no-go`) were left alone.
- Not done in this pass: no actual screenshot file (the user is capturing
  and dropping it in themselves), and the firestore.rules change above
  isn't deployed yet.

**Update (2026-08-29) — pricing tiers unified with platform_plans, capacity
fields, member photos:**
- **`website_pricing` is gone. The public Pricing page now reads
  `platform_plans` directly** (`active` ones, sorted by amount) — see §6's
  `platform_plans` entry and its own file-header comment for the full
  rationale. `duration_days` now doubles as the source for the page's
  price-suffix (`periodLabel()`: 30→"/mo", 365→"/yr", 7→"/wk", 90→"/qtr",
  else "/Nd") instead of a separate free-text period field, so there's one
  number to keep in sync instead of two. One casualty of true unification:
  the old "Enterprise — Custom pricing, Contact sales" tier concept doesn't
  fit anymore, since every plan now needs a real billable amount (no
  self-serve checkout exists anyway — every registration is manual, so a
  high tier can just carry a real starting price with `cta: "Contact
  sales"` instead).
- **`max_members`/`max_receptionists`** (number, null = unlimited) added to
  every plan. Rendered as the first two feature bullets on the public
  pricing card ("Up to 100 members" / "Unlimited receptionists").
  Informational only, everywhere, by explicit choice — nothing in
  `members.js`/`users.js`/`RegisterMember.jsx`/`ManageStaff.jsx` blocks a
  gym from exceeding its plan. `GymDetailPage.jsx`'s Subscription status
  block shows the gym's actual counts against its assigned plan's caps
  ("Members 87 / 100", a caution pill if over) when that plan has any caps
  set — purely a super-admin-facing readout, same "informational" rule.
- **`Settings.jsx`'s "Pricing plans" and "Website pricing" cards merged
  into one** — `PlanManager` now has a real Edit (the old create-only
  `CreatePlanModal` couldn't edit anything; `platformPlans.js`'s
  `updatePlatformPlan` already existed but had no UI). One modal covers
  amount/duration/capacity/marketing fields together. Retire/reactivate
  only, matching every other ledger-backed collection's "never
  hard-deleted" rule (§2) — the old `WebsitePricingManager`'s hard-delete
  "Remove" button is gone, which was the one place this app's pricing UI
  broke that rule.
- **`firestore.rules`**: the earlier `platform_settings/website_pricing`
  public-read carve-out is reverted (that doc doesn't exist anymore).
  `platform_plans` itself is now `allow read: if true` — the one publicly
  readable collection in this database — while `create`/`update` stay
  superadmin-only. **Still needs deploying** (no `firebase.json`/CLI
  project config exists in this repo, so rules changes here are pasted
  into the Firebase console by the user, not `firebase deploy`'d — same as
  every previous rules change in this document).
- **Member photos.** `photo_url` (reserved in the schema since before this
  entry, see §6) is now live. New `src/data/memberPhotos.js`
  (`uploadMemberPhoto`) uploads to Firebase **Storage** at
  `member_photos/{gymId}/{memberId}` (one current photo per member,
  re-upload overwrites), then writes the resulting download URL onto the
  member's own Firestore doc — reusing the *existing* bio-data update path
  (`/members/{id}`'s allow-list in firestore.rules just gained `photo_url`
  alongside name/phone/etc.), not a new write path. Deliberately **not**
  routed through the Electron local-first bridge (`data/local/`) the way
  every other member write is — there's no local-file-sync story for
  binary blobs yet, and a photo needs a live connection regardless, so this
  always talks to Firebase directly. Never required: `RegisterMember.jsx`
  gained an optional photo field (file picker + preview + Remove) that
  uploads *after* the member is already created, in its own try/catch that
  can't fail the registration itself; `MemberProfile.jsx`'s avatar bubble
  shows the real photo when one exists (falls back to the initial-letter
  badge otherwise) with an "Add photo"/"Change photo" control, desk-role
  only — owners stay read-only on member data everywhere, this included.
  **New `storage.rules`** (this project had no Storage security rules, and
  no `firebase.json`, before this change) mirrors firestore.rules' own
  helper-function style via Storage rules' `firestore.get()` cross-service
  read: read = superadmin or anyone in that gym, write = superadmin or a
  receptionist in that gym only (owners can't upload, matching the
  Firestore-side permission split exactly), 5MB cap, images only. **Two
  things the user needs to do that no code change can**: confirm Cloud
  Storage is actually enabled for this Firebase project (no evidence it
  ever was — this is the first feature to use it), and paste `storage.rules`
  into the console the same way `firestore.rules` changes get deployed.
- Not done in this pass: no offline queue/retry for photo uploads made
  while the Electron build is disconnected — a failed upload today just
  means "try again from the profile once you're back online," not a queued
  background retry. Building that is a materially bigger task than "a
  place to upload photos" and was treated as out of scope rather than
  guessed at.

**Not done / out of scope for this pass:**
- No deployment — same "nothing is hosted anywhere yet" gap §14 already
  notes for the app itself; this site ships as more routes in the same
  unhosted Vite build.
- No visual/browser verification — Playwright (the tool §16's mocked-
  preview workflow uses) isn't currently installed in this project, and
  standing it up was out of scope for this pass. Verified only via a real
  `npx vite build` (passes, no new warnings beyond the pre-existing bundle-
  size one) and by re-reading every new file against the actual CSS
  classes/tokens it references. **Recommend `npm run dev` and clicking
  through all four pages (light + dark, and a narrow window) before
  treating this as fully verified** — the same honest limitation every
  other UI change in this document flags when a real check wasn't run.

---

## 18. Multi-branch owner accounts + pooled billing (2026-09-01)

The user handed over real pricing tiers (Starter/Professional/Ultimate)
whose rows implied a capability GymOS didn't have: one owner managing
*more than one gym* ("branch"), with one subscription covering all of
them, plus a cross-branch reporting view. Before this, the model was
strictly one owner ↔ one gym everywhere — `users/{uid}.gym_id` a single
scalar, subscriptions living on each `gyms/{id}` doc independently, and
every `firestore.rules` check a scalar equality. Explicit decisions the
user made when asked (not open for reconsideration without asking again):
**billing is pooled per owner** (one subscription covers every branch, not
one per gym); **"Owner accounts: 1/1/Multiple" stays informational only**
(this built "one login, many branches," not "many logins sharing one set
of branches"); **branch-switching works in both web and the offline
Electron app**; **affiliate commission is decided once, at an owner's
original signup** (a branch added later never carries its own
attribution); **every branch stays synced continuously in Electron**, not
just the one being viewed.

**Core design decision:** `users/{ownerUid}.subscription` is the pooled
subscription's source of truth, but the exact same map is mirrored, in one
atomic batch, onto every `gyms/{id}.subscription` the owner manages, as a
cache. This is why `firestore.rules`' `gymIsOperational()`, `logic/
license.js`, `GymDetailPage.jsx`'s status block, and the entire Electron
pull pipeline needed **zero changes** — they already read
`gyms/{id}.subscription` and keep doing exactly that; only the *meaning*
of that field changed (a branch's own billing → a cached mirror of its
owner's). `gyms/{id}.status` (the per-branch instant-suspend toggle) stays
completely independent of this, untouched.

**Access model — additive, not a replacement:** owners get a `gym_ids:
string[]` array (primary gym first; `gym_id` itself stays forever as
"primary branch"). `firestore.rules` gained `myGymIds()` — every doc
without the field (every receptionist/affiliate/superadmin, and any owner
predating this) falls back to `[gym_id]`, a strict superset of the old
scalar check, so a single-branch account's access is byte-for-byte
unchanged. `inMyGym()` and ~10 collections' create/update rules switched
from `== myGymId()` to `in myGymIds()` — each of those also picked up a
real correctness fix along the way: `gymIsOperational(myGymId())` (the
caller's own primary gym) became `gymIsOperational(request.resource.data.gym_id)`
(the write's actual target gym) — identical under the old single-gym
model, genuinely different once caller and target can diverge.

**The one thing that made the owner-side UI cheap:** every owner screen
(`OwnerHome`, `MembersList`, `Finances`, `Attendance`, `ManageStaff`,
`GymSettings`, `ExpiringSoon`, `StaffProfile`) already reads a single
`gymId` from `useAuth()` and re-fetches on `useEffect([gymId])`. Making
`auth.jsx`'s `gymId` mean "the currently active branch" instead of "the
account's one gym" meant **none of those eight files needed to change at
all** — the sidebar switcher (`OwnerDashboard.jsx`, only rendered when
`branches.length > 1`) just calls `setActiveGym()`, and every screen
downstream reacts on its own.

**New/changed files:**
- `src/data/subscriptions.js` (new) — `setOwnerSubscription`/
  `lockOwnerSubscription`/`unlockOwnerSubscription`, each one atomic
  `writeBatch` across the owner doc + every managed gym.
- `src/data/users.js` — `createOwner` now also sets `gym_ids: [gymId]`;
  `getOwnerForGym` switched from `where("gym_id","==",gymId)` to
  `where("gym_ids","array-contains",gymId)`; new `addBranchToOwner(owner,
  gymId)` — the multi-branch equivalent of `createOwner`, also copying the
  owner's current subscription onto the new branch's cache so it starts
  locked if the account is already locked, not with a free grace period.
- `src/data/platformPayments.js` — `platform_payments` pivoted from
  `gym_id`/`gym_name` to `owner_uid`/`owner_name`; old records keep their
  original shape as history, never migrated (`Revenue.jsx` falls back to
  `gym_name` for them).
- `src/data/gyms.js` — `setSubscription`/`lockSubscription`/
  `unlockSubscription` removed, superseded by `subscriptions.js`.
- `firestore.rules` — `myGymIds()` added, `inMyGym()` + ~10 create/update
  rules updated per above. `firestore.indexes.json` gained the
  `users`(`gym_ids array-contains`, `role ==`) composite index.
- `src/auth.jsx` — `activeGymId`/`branches`/`setActiveGym` (localStorage-
  persisted per uid), the bootstrap/sync effects now loop over every gym in
  `resolveGymIds(account)` instead of one, and `syncStatus`/`lastSyncedAt`/
  `pendingCount` became aggregates over a new per-branch `branchSyncState`
  map (one real toast for a multi-branch "Sync now," not one per branch).
- Super admin: `src/features/admin/OwnerDetailPage.jsx` (new, route
  `/admin/owners/:ownerId`, drill-down only) is now the one place billing
  is managed — `GymDetailPage.jsx` lost its inline subscription modal and
  payment-history card, linking out instead; `SubscriptionModal.jsx` takes
  `owner`/`primaryGym` props instead of `gym`; `Subscriptions.jsx` lists
  owners, not gyms; `GymsList.jsx`'s owner-lookup bug (only matched an
  owner's primary gym) is fixed; `NewGym.jsx` gained a New/Existing-owner
  toggle (`src/components/OwnerPicker.jsx`, new, modeled on
  `CountryPicker.jsx`) — attaching to an existing owner skips both the
  owner-creation fields and the affiliate picker (nothing to attribute).
- Owner side: `OwnerDashboard.jsx` (branch `<select>`, conditional "All
  branches" nav entry), `src/features/owner/CrossBranchReport.jsx` (new) —
  aggregates members/attendance/revenue across branches, but only sums
  revenue when every branch shares one currency (mixed-currency owners
  still see each branch's own total, just not a meaningless combined
  figure — same reasoning `lib/helpers.js`'s `naira()` already documents).
- Electron: `electron/local-db/schema.cjs` v4 migration adds
  `users.gym_ids` (JSON text, read-only from Electron's side — never
  locally edited); `users.cjs`'s `rowToUser` parses it back; `pull.cjs`/
  `bootstrap.cjs` carry it through. No `sync_meta` schema change needed —
  the forward-only-clock/cursor tables stay keyed per-`gym_id` exactly as
  before, since pooling billing didn't change what "one branch's own sync
  state" means, only where its subscription values originate.
- `scripts/migrate-multi-branch-owners.mjs` (new, one-time) — backfills
  `gym_ids`/`subscription` onto every pre-existing owner, same
  env-var-credentials pattern as `scripts/seed-pricing-plans.mjs`.

**Two things the user needs to do that no code change can:**
- Paste the updated `firestore.rules` into the Firebase console (no
  `firebase.json`/CLI project exists here — same as every previous rules
  change this session).
- Run `scripts/migrate-multi-branch-owners.mjs` **together with** that
  rules deploy, not after — an owner doc still missing `gym_ids` when the
  new `array-contains` query goes live simply won't be found by
  `getOwnerForGym`/`GymsList.jsx`'s owner column until the migration runs.

**Not done / explicitly out of scope for this pass:**
- No enforcement of `max_branches` (or any capacity cap) — still purely
  informational, same as `max_members`/`max_receptionists` already were.
  `addBranchToOwner` is the one choke point a future enforcement pass would
  hook into.
- No support for multiple owner LOGINS sharing one set of branches (the
  "Owner accounts: Multiple" row) — by explicit user decision.
- No proportional affiliate-commission splitting across branches referred
  by different affiliates — by explicit user decision, commission is
  decided once, at an owner's original signup, full stop.
- No browser verification — same standing limitation this document flags
  for every UI change (no browser automation tool in this environment).
  Verified via `npx vite build` (clean) and re-reading every rule change
  against the actual `firestore.rules` file line-by-line before writing it.

---

## 19. Final logo, brand green, installer, tagline (2026-09-04)

The user finalised the logo and dropped it into `public/logo.png` +
`public/favicon.png` (confirmed byte-identical, 501×498 RGBA, fully
transparent background — a "G" mark: black outer ring, green inner leg).
Three things came with it: use it *everywhere* (web, Electron window,
browser tab, installer, installed app), unify the green on the logo's exact
`#16A34A`, and get the "Run your gym smarter" tagline out of its generic
eyebrow pill. A follow-up pass the same day added a fourth — a dark-theme
version of the mark — and corrected the green's scope from "the marketing
site" to "the whole app," which is what had actually been asked for.

**The logo inverts for dark mode — but only its black half.** The old
`logo1.png`/`logo2.png` pair (a black-mark and a white-mark version) is
deleted. `Logo.jsx` now picks between `src/assets/logo.png` and
`src/assets/logo-dark.png` on `useTheme().effective` — `effective`, not
`preference`, so "system" resolves down to whatever is actually on screen
and the mark follows an OS theme change with no explicit choice made.

`logo-dark.png` is **generated from** `public/logo.png`, not drawn
separately, which is what guarantees the two stay in sync. The generator
(Pillow) scores every pixel on how green it is — `g - max(r, b)`,
normalised — then passes green pixels through untouched and inverts
everything else. So the near-black ring (13,13,13) becomes near-white
(242,242,242) while the green leg stays byte-identical at (6,163,56): the
brand colour does not shift when the theme does, only the neutral half
flips. The normalisation threshold (60, well under the ~106 greenness of
the solid green) is what makes solid green survive at full strength while
the anti-aliased boundary pixels between black and green still blend
smoothly — a naive per-pixel invert would leave a halo of stray inverted
pixels along that edge. The generator is committed as
`scripts/make-dark-logo.py` (Pillow, no npm dependency) — **run it whenever
`public/logo.png` changes**; its outputs are committed files, not build
artifacts.

The same inverted image is also `public/favicon-dark.png`, wired up in
`index.html` as a `media="(prefers-color-scheme: dark)"` pair with a
plain unqualified `<link rel="icon">` after them as a fallback for
browsers that ignore `media` there. Known limitation, and it's inherent:
the browser picks a favicon from those media queries before any of our JS
runs, so the tab follows the OS/browser theme and **cannot** follow the
app's own in-page light/dark toggle. That's the right target anyway — the
tab strip itself is drawn in the browser's theme, not the app's.

**Why the logo lives in `src/assets/`, not just `public/`.** Electron loads
the built app over `file://`, where a root-absolute `/logo.png` resolves
against the filesystem root and 404s. Importing from `src/assets/` makes it
a hashed Vite module asset with a relative path that works in both builds.
`public/favicon*.png` stay where they are — those are only ever fetched by
a real browser over HTTP, which is exactly what `public/` is for.

**Windows icons.** `build/icon.ico` was regenerated as a genuine
multi-resolution ICO (16/24/32/48/64/128/256) from the logo padded to a
square, so Windows picks a crisp size per context (taskbar vs. Explorer
tile vs. Alt-Tab) instead of downscaling one bitmap. Built with Python's
Pillow — the `convert`/`magick` on this machine's PATH is Windows' own
disk-conversion utility, not ImageMagick. electron-builder already points
`build.win.icon` at that file, which covers both the installer's icon and
the icon embedded in the installed `.exe`. `electron/main.cjs`'s
`BrowserWindow` gained an explicit `icon:` too — that only affects an
*unpackaged* `npm run electron:dev` window, which otherwise shows
Electron's default icon.

**Installer asks about the desktop shortcut — via a custom NSIS page, not
a config flag.** `oneClick: false` in `build.nsis` is a prerequisite (the
default one-click installer has no wizard at all, so there is nowhere to
ask), but it is not sufficient, and the first attempt at this was simply
wrong: `createDesktopShortcut: true` was documented here as becoming "a
pre-ticked default on the wizard's shortcut page." **There is no such
page.** Reading electron-builder's own templates settles it —
`createDesktopShortcut` maps to a build-time policy enum
(`FRESH_INSTALL`/`ALWAYS`/`NEVER`, see
`CommonWindowsInstallerConfiguration.js`), and `assistedInstaller.nsh` has
no shortcut page in its page list. The option decides; the user is never
asked.

So the question is added as a real page in `build/installer.nsh`
(electron-builder auto-discovers that path — no `nsis.include` entry
needed), hooked to the `customPageAfterChangeDir` macro, which
`assistedInstaller.nsh` places after the install-directory page and before
the progress page — the conventional "Additional Tasks" slot.

The non-obvious part is *how* it declines: `createDesktopShortcut` stays
**true**, so electron-builder still creates the shortcut, and the
`customInstall` hook deletes it afterwards if the box was unticked
(`customInstall` runs after `addDesktopLink` — `installSection.nsh` lines
81 and 69). Doing it the intuitive way instead — `createDesktopShortcut:
false` plus creating it by hand when accepted — is a trap:
that flag defines `DO_NOT_CREATE_DESKTOP_SHORTCUT`, and `uninstaller.nsh`
skips its desktop-shortcut cleanup entirely under that define, so a
hand-made shortcut would be left orphaned on the desktop after an
uninstall. Reusing `$newDesktopLink` keeps creation, deletion, and
uninstall cleanup all pointed at one path.

`customInit` defaults the answer to "yes" for every path that never shows
the page (silent/command-line installs), matching electron-builder's own
default so nothing regresses.

**Two NSIS compile traps this hit, both worth knowing before editing
`build/installer.nsh` again** — each one failed the whole build:

1. **Put page `Function`s inside the macro, never at the file's top
   level.** electron-builder injects this include into a generated header
   that is *prepended* to its `installer.nsi`, so the file is processed
   before that file's own `!include "common.nsh"` / `"MUI2.nsh"`. Top-level
   code therefore compiles in an environment where `MUI_HEADER_TEXT` and
   LogicLib conditions like `${isUpdated}` do not exist yet — makensis
   aborts with `Error in macro _StdU_TestParameter` / `!include: error in
   script ... on line N`. A macro *body* is only expanded where it is
   inserted (inside `assistedInstaller.nsh`, well after those includes), so
   moving the functions into the macro fixes it. Only `Var` declarations
   are safe at top level. `${isUpdated}` was dropped rather than relocated —
   always showing the page, pre-ticked, is the ordinary Windows behaviour.
2. **Guard the whole file with `!ifndef BUILD_UNINSTALLER`.** makensis runs
   twice — once with `-DBUILD_UNINSTALLER`, once for the installer — and is
   fed this same include both times. Nothing here belongs to the uninstaller
   (that has its own `customUnInstall` hook), so on that pass the `Var`s are
   declared and never used, and electron-builder invokes makensis with
   **warnings treated as errors**: `warning 6001: Variable "..." not
   referenced or never set` kills the build.

   That strictness doubles as the verification that the page is really in
   the shipped installer. NSIS compresses its string table, so the page's
   text cannot be grepped out of `GymOS Setup 1.0.0.exe`. But the same
   `Var`s are declared unconditionally on the installer pass — if
   `customPageAfterChangeDir` were not being inserted, they would be
   unreferenced there too and the build would fail exactly as the
   uninstaller pass did. A clean build is therefore proof the macro was
   inserted.

**Green unified on `#16A34A` app-wide — one token change, no
find-and-replace.** First attempt scoped this to `.site` only, reading
"across the website" as the marketing pages. Wrong: the user meant the
whole product, and screenshots of the login button and admin sidebar next
to the logo made the mismatch obvious — an olive `#619D25` button beside a
`#16A34A` mark. `src/index.css`'s `:root --accent` is now `#16A34A` /
`--accent-rgb: 22, 163, 74`, and the `.site` override is deleted as
redundant. Everything downstream already read `var(--accent)` /
`rgba(var(--accent-rgb), …)` — primary buttons, active sidebar/nav/tab
items, focus rings, checkbox/radio `accent-color`, table header tints,
sync toasts, the "OS" half of every wordmark — so one declaration moved
all of them. A grep confirmed no hardcoded `#619D25` survives anywhere.
Unconditional across light and dark, as asked, and light-mode shadow
styling was left untouched.

**Consequence worth knowing:** `--ok` was already `#16A34A`, and the
top-of-file palette comment used to justify it as "a different, cooler
green than `--accent` so the two don't collide." That distinction is now
gone by choice — accent-green and status-green are the same green, told
apart by placement and shape rather than hue. The comment was rewritten to
say so instead of being left asserting something false.

**Tagline moved out of the eyebrow pill.** A small pill above the `<h1>`
was called out as generic ("everybody is also doing same"). The
`.site-eyebrow` span is gone from `MarketingHome.jsx`; the line is now its
own `.site-statement` section between the feature grid and the closing CTA
— centred, 44px/800-weight, with "smarter" in the brand green. It reads as
a deliberate statement at the end of the scroll instead of a badge
competing with the headline it sits on top of.

**Also in this pass (smaller fixes, same day):**
- **Modal scrollbar/rounding** — `.modal-card` had padding *and*
  `overflow-y: auto` on the same rounded, bordered element, so a tall
  popup's scrollbar cut a flat rectangle through the rounded right corners.
  Split into an outer frame that keeps the border/radius/`overflow: hidden`
  and an inner `.modal-card__scroll` that does the scrolling and padding —
  the native scrollbar is now clipped to the rounded shape.
- **Paired-field misalignment** — "Max branches (blank = unlimited)" wrapped
  to two lines while its neighbour didn't, pushing one input below the
  other. Labels shortened (the explanation moved to the hint below), and the
  row switched from `.row2` (2fr 1fr) to `.row2--even` (1fr 1fr), which it
  should have been anyway.
- **Pricing page shows only what the admin typed** — `Pricing.jsx`'s
  `capacityLine()` helper auto-generated three capacity bullets from
  `max_branches`/`max_receptionists`/`max_members`, substituting
  "Unlimited" for any `null`. That silently rewrote the user's deliberate
  "More than 3 branches" / "10+ receptionists" wording into "Unlimited".
  Removed entirely: the checklist now renders `plan.features` verbatim, and
  `Settings.jsx`'s label says so ("Features (one per line — this is
  everything the pricing page shows)"). The `max_*` fields stay
  internal-only, as §18 already noted. `scripts/seed-pricing-plans.mjs`'s
  `PLANS` were rewritten to spell out capacity wording in `features`.

**Not done / known gaps:**
- The browser-tab favicon follows the OS theme, not the app's own toggle —
  inherent to how favicons are resolved, explained above.
- `build/icon.ico` is built from the light (black-ring) logo only. Windows
  has no per-theme app-icon mechanism to hook into, so there is nothing to
  switch on; the black ring is the right default against Windows' own
  light and dark taskbars alike.
- No visual verification by running the installer — no way to execute a
  real Windows install-and-launch cycle here. What WAS verified on the
  built artifacts: `npm run electron:build` exits 0 with no makensis
  warnings; the icon embedded in `release/win-unpacked/GymOS.exe` and in
  `release/GymOS Setup 1.0.0.exe` extracts as the new mark; `app.asar`
  contains both `logo-*.png` and `logo-dark-*.png`; the packaged CSS has
  exactly one `--accent` declaration and it is `#16A34A`; and the packaged
  `index.html` carries both favicon links. The shortcut page itself is
  proven present by the warnings-as-errors argument above, not by eye.
- **Build gotcha worth remembering:** the first `electron:build` failed
  with `EPERM: rename release\win-unpacked.tmp -> release\win-unpacked`.
  That is a Windows file-lock on the previous unpacked output (Defender
  scanning the freshly-extracted Electron binaries is the usual cause, a
  still-running GymOS.exe the other one), not a configuration problem —
  delete `release\win-unpacked.tmp` and run again. Also note `npm run
  electron:build | tail` **hides this**: the pipe reports tail's exit code,
  so a failed build still looks like exit 0. Redirect to a log and check
  `$?` instead.

---

## 20. Owner lockout bug, modal alignment, offline photos (2026-09-04)

**The owner-side outage was a Firestore rules bug, and a subtle one.**
Every owner page reported "Couldn't load …" while super admin worked fine.
Cause: in Firestore rules, **reading a map key that does not exist raises
an error**, and an erroring rule denies. `gymIsOperational()` did
`g.subscription.locked != true`, which blows up on any gym whose
`subscription` map exists but has never been locked or unlocked — the
"Not yet set" state. Super admin never hit it because `isSuperAdmin()`
short-circuits the `||` before `gymIsOperational()` is reached, and
`gyms/{id}` reads don't call it at all, which is why the gym's own name
still rendered while everything inside the page failed.

The tell that pinned it down: `plans` showed its empty state (no error)
while `custom_fields` errored. Rules only run against documents a query
actually returns, so an empty collection passes trivially — the two
collections have byte-identical read rules, so the difference could only be
"has rows" vs "has none".

Fix: `.get(key, default)` everywhere a rule touches a field that may be
absent — `g.get(['subscription','locked'], false)`, `g.get('status','')`,
`myRole()`, `myGymIds()`'s fallback, and the `users` rules'
`resource.data.gym_id`/`role` (a superadmin or affiliate doc has no
`gym_id` at all, so an owner reading one hit the same trap).
`storage.rules` had the identical hazard and got the same treatment.
**Rule of thumb for this file: never dot-access a field that isn't
guaranteed present. Use `.get()` with a default.**

**Every modal's paired fields were misaligned** — the right-hand one sat
14px low in "Register a gym", "Create a plan", "Add a receptionist",
"Change password", and the rest. `.field + .field { margin-top: 14px }`
exists to space *stacked* fields, but the two fields inside a `.row2` grid
are adjacent siblings too, so it fired on them as well. The grid's own
`gap` already handles that spacing, so `.row2 > .field + .field
{ margin-top: 0 }` cancels it. (Confirmed rather than guessed: the
screenshots were rendered at ~1.5×, and the measured offset was ~21px =
14 × 1.5.)

**Member photos now work fully offline — the files, not just the URLs.**
`photo_url` shipped on the web but was never added to the local SQLite
mirror, so the desktop app dropped it on every pull. Migration v5 adds
`members.photo_url` (carried by `bootstrap.cjs`, `pull.cjs` and the new
`setMemberPhotoUrl` op), and migration v6 adds a `member_photos` table
holding the image **bytes** so a genuinely disconnected desk still shows the
member's face.

Three decisions in that table worth keeping:
- **BLOB inside the SQLite file, not loose files under `userData/`.** The
  database is SQLCipher-encrypted and a member photo is personal data about
  a real person, so keeping it inside that encryption boundary is the
  point. It also keeps photos in the same single-file backup/wipe story as
  everything else.
- **The download runs in the MAIN process** (`memberPhotos.cjs`'s
  `cacheMemberPhoto`, via Node's `fetch`), not the renderer. Firebase
  Storage download URLs carry no CORS headers unless the bucket is
  explicitly configured, and the renderer runs from `file://` — an
  `<img src>` renders fine (image loads aren't CORS-gated) but `fetch()`
  from the renderer would be blocked. Doing it main-side means the bucket's
  CORS config never has to change.
- **`url` is stored next to the bytes.** The Storage path is stable per
  member (`member_photos/{gym}/{member}`) but its download token changes on
  re-upload, so a plain "do we have a row?" check would pin the first photo
  forever. The sync pass diffs URLs, and `resolveMemberPhotoSrc` refuses a
  cached row whose URL no longer matches the member's — showing a stale
  face is worse than showing none.

`syncMemberPhotos` runs last in the pull cycle (photos are the largest and
least urgent payload, and both member passes must land first so `photo_url`
is current), capped at 8 downloads per cycle so a first sync of a
photo-heavy gym can't saturate the connection or starve the record sync the
desk actually needs. An upload caches the file it already holds rather than
re-downloading its own bytes. Not built: cache eviction — a gym with
thousands of photographed members will grow the local database
accordingly, and nothing prunes it.

**Members are no longer treated as append-only**, which was a real
correctness bug rather than a missing feature. The incremental pull walks
`created_at`, so it finds new members but can never revisit one it has
already imported — meaning a photo or a corrected phone number added on one
device would never reach another that had already synced that member. Fixed
with a second cursor: member writes now stamp `updated_at`, and
`pullFactAndMembers` makes a second pass ordered by it (cursor key
`members_updated`, so the two passes never fight over one stored position).
Neither pass can do the other's job — a `created_at` cursor never revisits a
row, and an `updated_at` cursor never sees a member that has never been
edited, since `orderBy` silently drops documents missing the field.
`applyPulledMembersPage` now refreshes existing rows instead of skipping
them, but **only** rows marked `synced`: a `pending` row holds local work
that hasn't reached Firestore, and overwriting it would destroy the desk's
own edits. Needs the new `members`(`gym_id`, `updated_at`) composite index
and `'updated_at'` in the members-update `affectedKeys` allow-list.

**Offline sign-in window cut from 30 days to 14** (`credentials.cjs`), on
request. Worth being explicit that this is a *tightening*: a device that has
been offline between 14 and 30 days and used to sign in will now be refused
with reason `expired`. The user-facing string in `LoginPage.jsx` and the
§15 references were updated to match — they would otherwise have kept
promising 30.

**Smaller items in the same pass:** the login page's logo/wordmark links
back to the marketing home (web only — Electron has no marketing site, so
it stays an inert `<div>` there); signing out lands on `/login` rather than
the marketing homepage, via `RequireRole`'s redirect, which is the single
point every sign-out passes through while a protected route is mounted;
the member profile photo went from 56px to 112px (`.avatar-badge--xl`) —
sized for face recognition, since the point of the photo is that the desk
can confirm the person, while the register-form preview stays at 56px
because it only answers "did the right file attach?"; the marketing header
wordmark went 18px → 27px against its 32px mark; and the footer was reduced
to a single centred line of plain text, "GymOS by Nobody Brothers" with the
OS in `--accent` and no logo mark — the header already carries the full
lockup and the same three nav links on every page, so repeating either at
the bottom of a short page is duplication rather than reinforcement. It
matches `LoginPage.jsx`'s own footer line exactly, so the site and the
product sign off identically.

**Paired rows must use ONE column ratio per form.** `.row2` is 2fr 1fr and
`.row2--even` is 1fr 1fr, and mixing them inside a single form gives the
right-hand column two different left edges — visible in "Register a gym",
where the address/country row was `--even` while every other row was plain
`.row2`, so "Gym address" was narrower than the full-width fields around it
and "Country" started further left than Prefix / Owner phone / Affiliate
marketer. Both that row and the plan modal's Max branches/receptionists row
are now plain `.row2`. This is a separate defect from the 14px vertical
offset above and was masked by it; `--even` remains correct only where a
form uses it throughout (`ChangePasswordForm.jsx`).

**Deploying rules and indexes.** `firebase.json` + `.firebaserc` now exist,
so the whole lot goes up in one command:

```
npx firebase-tools deploy --only firestore:rules,firestore:indexes,storage
```

(`npx firebase-tools login` first, once, as the project owner.) This is the
first CLI config this repo has had — every earlier rules change was pasted
into the console by hand, which is also why `firestore.indexes.json` had
drifted into being a documentation file rather than something deployed.

**Claude cannot run that deploy**, and the reason is worth writing down so
it isn't re-litigated: the only Firebase credentials in the repo are the
seven `VITE_FIREBASE_*` values in `.env`, and as `.env.example` says in its
own header, those are public web-app config that ships to every browser.
They authenticate a *client*, not an administrator — they cannot create
indexes or publish rules. Deploying needs an owner's interactive
`firebase login` or a service-account key, neither of which exists here and
neither of which should be pasted into a chat.

**Still to do before this ships:** run that deploy, then rebuild the
Electron app — `release/` was deleted and nothing regenerates it but
`npm run electron:build` (see §16.5).

---

## 21. GitHub + Vercel hosting (2026-09-04)

**The repo tracks the desktop app's SOURCE but never its ARTIFACTS.**
`release/` and `dist/` are ignored; `electron/`, `build/` (icon.ico,
installer.nsh, the installer sidebars) and `scripts/` are tracked. Vercel
never looks at any of it — it runs `npm run build`, which only touches
`src/` and `public/` — so the desktop files cost nothing to deploy, and
keeping them versioned is what makes the installer reproducible on a second
machine instead of existing only on one laptop. `.claude/` is ignored too:
machine-specific tool-permission state, useful to nobody else.

**`base` is now per-target, and this was a latent deploy bug.** It was
`"./"` unconditionally, which Electron needs (it loads `index.html` off the
filesystem, where a root-absolute `/assets/...` resolves against the drive
root and 404s). But relative asset paths break a web SPA served with a
catch-all rewrite: at `/pricing` a relative `./assets/index-abc.js`
happens to resolve correctly, but at `/owner/members` it becomes
`/owner/assets/index-abc.js` and 404s — every nested route would have
loaded a blank page. `vite.config.js` now switches on mode: `vite build`
→ `"/"` (Vercel), `vite build --mode electron` → `"./"`. `npm run build`
is the web build; `build:electron` is the desktop one, and `electron:build`
calls the latter. `.env` loads in both modes, so the Firebase values are
unaffected by the mode switch.

**`vercel.json`** sets the Vite framework preset plus the catch-all rewrite
`/(.*) → /index.html`, without which any deep link or page refresh
(`/pricing`, `/owner/members`) 404s — Vercel checks the filesystem before
applying rewrites, so real assets still serve normally.

**Firebase config was already deployment-ready**: `src/data/firebase.js`
reads all seven values from `import.meta.env.VITE_*` with nothing
hardcoded, and `.env` is git-ignored. Set these seven in Vercel (Project →
Settings → Environment Variables), for Production, Preview and Development:

```
VITE_FIREBASE_API_KEY
VITE_FIREBASE_AUTH_DOMAIN
VITE_FIREBASE_PROJECT_ID
VITE_FIREBASE_STORAGE_BUCKET
VITE_FIREBASE_MESSAGING_SENDER_ID
VITE_FIREBASE_APP_ID
VITE_FIREBASE_MEASUREMENT_ID
```

Values come from Firebase Console → Project settings → Your apps → SDK
setup and configuration. They are **not secrets** — Vite inlines every
`VITE_`-prefixed variable into the client bundle at build time, so all
seven ship to every browser regardless. That is by design for Firebase web
config; the actual protection is `firestore.rules` / `storage.rules`, which
is why the rules bug in §20 mattered so much more than any of these values
leaking would. Never put a service-account key in a `VITE_` variable — that
one IS a secret and would be published to every visitor.

**After the first deploy**, add the Vercel domain to Firebase Console →
Authentication → Settings → Authorized domains, or sign-in fails on the
live site while working locally.

**`.vercelignore` — and the one trap in it.** Adding this file **replaces**
`.gitignore` as Vercel's upload filter; Vercel only falls back to
`.gitignore` when no `.vercelignore` exists. So everything `.gitignore` was
doing for deploys has to be repeated, which is why `node_modules`, `dist`
and `.env` are listed there despite already being in `.gitignore`.

`.env` is the entry that actually matters. A `vercel` CLI deploy uploads
the working directory as-is, so an unignored `.env` would ship to the build
and Vite would read it **instead of** the values in Project Settings →
Environment Variables — silently deploying whatever this laptop happens to
have configured, with no error. Git-based deploys are safe either way,
since the repo never contains `.env`; the CLI path is the exposed one.

What it does NOT do is change the built output. Nothing under `electron/`
was ever reaching `dist/`: the renderer talks to the desktop layer through
`window.gymOS`, which preload injects at runtime, so no file under `src/`
imports anything from `electron/`. This is purely upload size and deploy
time — the upload drops from the full working tree to ~2.7 MB.

Verified by building from a pruned copy containing only what
`.vercelignore` leaves behind (`src/`, `public/`, `index.html`,
`package.json`, `package-lock.json`, `vite.config.js`, `vercel.json`):
clean build, root-absolute asset paths, both `logo-*.png` and
`logo-dark-*.png` emitted, and zero matches for `better-sqlite3` /
`local-db` / `electron/main` in the bundle. If `.vercelignore` is ever
extended, re-run that check rather than assuming — excluding
`package-lock.json` or `vite.config.js` would break the build in ways the
local `npm run build` would never surface.

---

## 22. Self-service downloads: installer + role guides (2026-09-04)

So an owner who isn't sitting with the super admin can set themselves up:
sign in through the browser, take the desktop installer and the guide for
their role, done.

**Data model** — a `downloads` collection with **fixed document ids**, not
generated ones: `desktop_app`, `guide_owner`, `guide_reception`. There is
exactly one current installer and one current guide per role, so replacing
one should overwrite that single row rather than accumulate stale versions
the download page would then have to sort through. `firestore.rules` gives
read to any signed-in user and write to super admin only; `storage.rules`
does the same for `downloads/{fileName}`.

**Each entry is EITHER an upload OR a link, and that split is the point.**
The guides are small PDFs and belong in Firebase Storage. The installer is
**~120MB**, and Storage's free tier allows **1GB of egress per day** —
about eight downloads before the project starts refusing them, or billing
on Blaze. Given this project has already had one warning email from
Firebase, serving the installer from Storage would be actively reckless. A
GitHub Release hosts the same file free and unmetered, so the admin page
offers a Link tab alongside Upload. The customer's download button is
identical either way; only who pays for the bandwidth changes.

`storage_path` is recorded only for uploaded entries. It is what lets
`setDownloadLink` delete a previously-uploaded object when an entry is
switched from upload to link — otherwise that file would be orphaned in
Storage, referenced by nothing and paid for forever — and what tells
`removeDownload` whether there is anything to clean up at all. Uploads use
a fixed path per kind (`downloads/{id}`) so re-uploading overwrites rather
than accumulates.

**Who sees what** is declared once, in `DOWNLOAD_KINDS[].roles`, and both
the customer page and the admin page read from it. Owners get the app plus
the owner's guide (which covers the front desk too, so they can train
their own staff); receptionists get the app plus the front-desk guide.
`features/DownloadsPage.jsx` is one component shared by both roles rather
than two near-identical pages — the only difference between them is which
entries are listed, which that array already describes.

**Files:** `src/data/downloads.js` (new) · `src/features/DownloadsPage.jsx`
(new, owner + desk) · `src/features/admin/Downloads.jsx` (new, route
`/admin/downloads`) · nav entries and routes in all three dashboards ·
`IconDownload` in `NavIcons.jsx` · `.download-row` CSS · `downloads` rules
in both rules files.

**Two things worth knowing:**
- The download button is a plain `<a href download>`, not a fetch-then-save.
  A 120MB installer served from another host should stream straight to disk
  rather than being pulled through the page's memory first. `download` is
  only a hint cross-origin, which is fine — the worst case is the browser
  navigating to the file, which still downloads it.
- This page appears in the Electron nav too, where it is the one screen with
  no offline story by design (it reads Firestore directly and the files are
  remote). It says so explicitly — "Downloads need an internet connection"
  — rather than showing a bare "couldn't load" that would read as a bug in
  an app whose whole selling point is working offline.

**Still needed:** deploy both rules files (the `downloads` rules are new),
then publish the three entries from `/admin/downloads`.

**`webOnly`** hides the installer entry inside the desktop app itself —
offering "download the desktop app" to someone already running it is noise,
since the installer exists to set up a NEW machine, which happens in a
browser. The guides carry no such flag: equally useful at the desk.

---

## 23. Sync reported success while records were rejected (2026-09-04)

A member created offline showed "Synced successfully" but never appeared on
another device. The record was not lost — it was still on the laptop,
correctly marked `pending` — but the sync had told the user it was done.

**Two separate faults, and the reporting one is the more dangerous.**

`pushPendingChanges` catches per-record and per-chunk failures, logs them to
console, and continues. That part is deliberate and correct: one rejected
member must not strand a day's payments. But it returned nothing, so
`runSyncCycle` had no way to know anything had failed, kept `ok = true`, and
`syncNow` reported success. **A sync that says it worked when it didn't is
worse than one that says it failed, because nobody goes looking.**

Fixed by making failure a return value rather than a console side effect:
each push helper counts its failures, `pushPendingChanges` returns
`{ failedCount }`, and `runSyncCycle` sets `ok = false` when it is non-zero.
The manual toast now says "Some records didn't sync — still saved here, will
retry" rather than a flat "sync failed", because the distinction matters to
whoever is at the desk: the record is safe locally, but it is NOT on the
server and nobody else can see it yet.

Also counted: the case where the gym doc can't be read, so `gymPrefix` is
null and `pushMembers` is skipped entirely. That silently pushed zero
members while reporting success.

**A related hole, found the same day and closed:** a member photographed
BEFORE `updated_at` stamping existed could never reach a device that had
already synced that member. The `created_at` cursor had walked past the
row; the `updated_at` cursor uses `orderBy("updated_at")`, which silently
drops documents that lack the field entirely — which is exactly those
members. The symptom was a photo visible on the web but never in the
desktop app, and it applied to any stale field, not just photos.

Fixed with `reconcileMembersOnce` in `data/local/pull.js`: one full members
refetch per gym per app session, applied over whatever is already local.
Chosen over the alternatives deliberately — a backfill script would need a
receptionist's credentials (super admin has no `update` on `members` by
design, and widening that boundary for one migration is the wrong trade),
and a targeted `photo_url` query would need a new composite index while
only repairing the one field someone happened to notice. The refetch needs
no script, no index (single-field `gym_id` equality) and no rules change.
Once per session, not per cycle: it costs a read per member, which is fine
when the app opens and wasteful every few minutes. The cursor passes remain
the steady-state mechanism; this is the self-heal.

**The underlying rejection** was almost certainly §20's `gymIsOperational`
rules bug, still undeployed at the time. `members` create requires
`gymIsOperational(...)`, which errored on any gym whose `subscription` map
had no `locked` key — so the create was denied, and the create transaction's
`gyms.member_seq` update with it. Deploying the fixed rules lets the already-
installed app push the pending record on its next cycle; no rebuild is needed
for that, since the fix is server-side. The reporting fix does need a rebuild
to reach an installed desktop app.

---

Historical checkpoints from before most of this was built (kept for
reference — largely superseded by the above once there's a live gym to test
against for real):
- Create an owner, log in as them → land on the owner dashboard.
- Owner creates a receptionist + plans; log in as receptionist.
- Register a member, take a membership payment, see the green verdict, record
  attendance; buy a daily equipment pass and confirm it expires at midnight.
- Owner sees that attendance + payment, can expand to the receptionist, and
  revenue sums correctly.
- Suspend a gym from super-admin → desk goes to `LockedScreen` and Firestore
  serves no operational data; reactivate → everything returns intact.
