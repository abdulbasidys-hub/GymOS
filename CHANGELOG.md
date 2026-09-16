# Changelog

What shipped, when, and what it means for a gym already using GymOS.

---

## How versions are numbered

One version number covers the whole product — the web app and the desktop
app ship together from the same `package.json`, so a gym on 1.2.0 is on
1.2.0 everywhere. The git tag is `v` + that number, and the installer's file
name follows it.

| Change | Bump | Example |
|---|---|---|
| **Patch** `1.0.x` | Fixes and polish. Nothing new to learn: a bug, wording, a layout correction, a rebuilt guide. Staff notice nothing except that something stopped being wrong. | Password dots too large; a stale sentence in a manual |
| **Minor** `1.x.0` | New capability, nothing taken away. A new screen, a new field, a new thing a role can do. Existing gyms keep working untouched and can ignore it. | Free trials; password resets; a new report |
| **Major** `2.0.0` | Something existing changes meaning, or somebody must act. A change to how expiry is calculated, a permission that removes access someone had, a data migration, or a desk build that can no longer sync with the server. | Changing membership from a year to a chosen length |

Two rules that matter more than the table:

- **If a gym has to be told about it, it is not a patch.** The test isn't how
  much code moved, it's whether anyone outside this repo has to change what
  they do.
- **Anything that touches the money or attendance history is a major**, even
  if the diff is one line. Those records are the product's evidence; if their
  meaning shifts, that is not a quiet upgrade.

Bump `version` in `package.json`, then follow [docs/RELEASING.md](docs/RELEASING.md)
to build, publish the installer and point the Uploads page at it.

---

## 1.0.0 — 16 September 2026

First packaged release. Live on the web at **gymos.africa**, with the Windows
desk app published as a GitHub Release.

### Accounts and access

- **Suspending a staff account now actually suspends it.** Previously
  `active: false` was only a label on the Team list — nothing checked it, so
  a "deactivated" receptionist could still sign in and work. It is now
  enforced in the security rules (the server denies a suspended account every
  read and write), in the app, and in the offline desk build, so going
  offline is not a way around it. The control reads **Suspend / Unsuspend**.
- **Password resets.** GymOS sends no email and has no self-serve recovery,
  so a forgotten password used to mean creating a whole new account. Whoever
  created an account can now reset it to the starter password, with the
  change-on-next-sign-in flag set. A browser cannot change another account's
  password, so this runs as a callable Cloud Function — which is also where
  the rules about who may reset whom are enforced: super admin for anyone, an
  owner for a receptionist at one of their own gyms, nobody else.
- **Free trials.** A new gym can be given 1, 2, 3 or 6 months of full access,
  chosen when the gym is created. A trial locks at the end exactly like a
  lapsed subscription and nothing recorded is lost. It deliberately records no
  platform revenue and no affiliate commission, because no money changed
  hands; converting to a paid plan clears the flag.

### The phone layout

- Each role's bottom bar now shows only what fits, with the rest behind a
  **More** button on the far left and Settings pinned on the far right:
  owner `More · Members · Dashboard · Finances · Settings`, front desk
  `Check-in · Members · Finances · Settings`, super admin
  `More · Dashboard · Gyms`, affiliate `Settings · Gyms · Revenue`. The
  desktop sidebar is unchanged and still shows every link.
- "Create" buttons become a round **+** above the bar, shown only on pages
  that create something.
- The light/dark choice moved out of the header and into each role's
  Settings, where all three options fit. Super-admin Settings gained the
  appearance choice it never had.
- The browser strip above the app now matches the bar beneath it instead of
  the page background.
- Affiliates got a real Settings page — payout details, appearance, password
  — instead of a gear popup.
- The frameless desktop window's close button was removed.

### Downloads

- The desktop installer is offered to **owners only**. Installing software on
  a gym's computer is the owner's decision, not a receptionist's. Desk
  accounts still get their own guide, which sits inside Settings on a phone.

### Documentation

- Two illustrated PDF manuals — an owner's guide that also covers the whole
  front desk, and a shorter desk-only guide. Written in plain language for
  the people who use the software. Every screenshot is captured from the
  running app by `scripts/capture-screens.mjs`, which is read-only: it never
  presses a button that records a payment, an attendance or a member.
- [docs/RELEASING.md](docs/RELEASING.md) — publishing a build and wiring up
  the Uploads page.

### Known issues

- Opening a member's profile by direct URL briefly shows *"Couldn't load this
  member."* even though the page loads. The first load starts before the
  active gym is known, and its error arrives after the successful retry.
  Reaching the page the normal way — clicking a row — is unaffected.
- The affiliate Settings page has not been exercised against a live affiliate
  account; it builds and mirrors the desk Settings page, but no one has
  signed in and used it.
- `gym_ids` on an owner account can point at a gym the owner doesn't own,
  which denies them everything with no useful error. Seen on one demo
  account. Worth a guard so `gym_ids` always contains `gym_id`.
