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

## 1.1.0 — 23 September 2026

### Expired equipment now actually stops somebody being checked in

**This was a bug, and it let people train without paying.** The banner said
<strong>Entry blocked</strong>, but the <strong>Record attendance</strong>
button underneath it stayed live — so a member whose equipment access had run
out was being checked in and sent to the machines. The two were being decided
by different rules.

Now they are decided by the same one. Both membership and equipment must be
good before anybody can be checked in. If either has run out the button is
switched off, and the message beside it names which payment to collect.

**Equipment that has just been paid for still lets them in**, and now says so
properly: it reads <strong>Starts today</strong> in amber instead of a red
<strong>Expired</strong>. It was always allowed — checking them in is what
starts the clock — but the screen used to show it as expired, which is exactly
what made a receptionist take the money a second time.

Nothing already recorded changes. This only affects check-ins from now on.

> **If a gym has membership tiers but no equipment plans, every member will
> now be blocked at the door.** Make sure each gym has at least one equipment
> plan set up.

---

## 1.0.1 — 17 September 2026

Fixes found in a pre-launch audit. Nothing new to learn; three things that
could have bitten a paying gym.

### An expired subscription now actually stops the gym

The security rules only ever checked the manual `locked` flag — they never
looked at the expiry date — and the web app locked on that same flag alone.
So a subscription that simply ran out kept working on the web indefinitely,
until somebody noticed and switched it off by hand. Only the offline desk
app enforced the date.

Free trials turned that from an edge case into the normal path: **every
trial handed out would have run forever.** The server now refuses a gym once
it is past its expiry date plus its grace window, and the web app locks with
the same screen the desk app already showed.

The check is deliberately fail-open: a gym with no subscription, or with an
expiry that isn't a real date, stays working. Only a genuine timestamp in
the past locks anything.

### Sync Monitor shows what each gym is running

Sync Monitor now has a **Running** column: whether a gym is on the desktop
app, the installed app on a phone, or an ordinary browser — plus when that
client was last opened.

A gym can show more than one, which is normal rather than a fault: the desk
on the desktop app while the owner checks takings from their phone is two
clients for one gym. Anything not seen in 30 days drops off, so the column
says what they use now, not everything they have ever opened.

A gym reports this when somebody signs in. **Unknown** therefore means nobody
has signed in since this was added, not that the gym is inactive — and a desk
working offline can only report once it next reaches the internet.

### Contact form messages now actually reach us

**This was broken, and silently.** The Contact page on the website looked
like it worked — you filled it in, pressed Send, and the page accepted it —
but nothing was ever sent or stored. Every enquiry submitted since the site
went live was discarded, with no error shown to the sender. None of it can be
recovered, because it was never anywhere.

Messages now arrive in a new **Inbox** page for super admin, newest first,
with the sender's email as a one-tap reply link. Mark one handled once you've
got back to them, and it stops counting as waiting. Anything still waiting
also shows on the dashboard, so an unanswered enquiry is hard to miss.

### People can apply to become an affiliate

A new **Become an affiliate** page on the website, reached from the Contact
page — deliberately not from the site's top nav, which is for visitors
deciding whether to buy. An applicant gives their name, phone, email and a
photo — the photo is for their welcome flier, and the form says so, since
people send the wrong kind of picture when they don't know what it's for.

Applications land in the Inbox on their own tab, photo included, openable at
full size. Accepting somebody is still the existing "Register a marketer"
step, which is what creates their account and temporary password.

### A guide written for marketers

Marketers now have their own manual, and it covers the **whole** product, not
just their portal. The reason is simple: when an owner doesn't understand
something, they ring the person who sold it to them, not us.

Sixteen chapters — what GymOS does, the three plans and prices, the three
ways it runs, the owner's screens, the desk's screens, the rules that cause
the most confusion, offline working, what locking looks like, how commission
actually works, an onboarding checklist, the calls they'll get with answers,
and the things they must never promise.

It's on their Downloads page alongside the app and the two role guides. As
with every other download, it appears once you publish it from Uploads.

### Marketers can download the app and both guides themselves

The affiliate portal has a **Downloads** tab: the desktop installer and both
the owner's and the receptionist's guide. A marketer demos GymOS to gyms that
haven't signed up, so they need it on their own laptop, and they get asked
front-desk questions as often as owner ones. Neither guide contains any
gym's data.

Receptionists still don't see the installer — putting the desk software on a
gym's computer stays the owner's decision.

### Payout details now include the account name

The payout export had the marketer's name, bank, account number and amount.
The name was their GymOS profile name, which is not necessarily the name
their bank has on the account — a business account, or a relative's. A
transfer is checked against the bank's version, so paying against the wrong
one gets rejected or, worse, goes somewhere unintended.

Marketers now enter an **account name** themselves, alongside bank and
account number. It shows on the payouts table and exports as its own column,
next to their name rather than instead of it.

Two other changes to that export: it now covers **only marketers with
something pending**, so every row is a transfer you're about to make, and the
page names anyone who is owed money but hasn't finished their payout details
— previously they exported as blank cells you'd only notice at the bank.

### Each marketer can have their own commission rate

Affiliate commission was one number for everybody. Now a marketer can be put
on their own rate: open **Marketers**, pick them, and use the **Commission**
card. The choice is "platform default" or "a rate just for this marketer",
and the rate itself is a dropdown rather than a typed number.

Anyone you don't set a rate for keeps following the default on Settings,
including any later change to it — so nothing moves unless you move it. The
marketer list shows every rate at a glance, marked *default* where it's
inherited.

**No rate can exceed 50%**, the per-marketer one or the default. The
platform keeps at least half of every payment, and that limit is enforced on
the server, not just in the form.

Setting a rate to 0% is different from leaving someone on the default: 0%
means that marketer earns nothing on new payments.

Rates apply to payments recorded from then on. Commission already recorded
keeps the rate it was recorded at — changing a rate never rewrites money
somebody has already earned.

### The desk no longer signs itself out mid-shift

GymOS signed an untouched screen out after 30 minutes. That was too short
for the way the desk is actually worked. A phone spends the day closed in a
pocket, and a closed app counts as untouched — so a gym running reception
off a phone re-typed the password every time the place went quiet. On a
computer it was not much better: a shift runs 6 to 8 hours, so the timeout
was firing on somebody who had never left the desk.

**The wait is now 6 hours, on every device.** Closing the app does not sign
anyone out; only 6 hours with nobody using it does. The session still
expires — a screen left signed in overnight will not still be signed in in
the morning — but it should no longer interrupt anyone mid-shift.

Handing the desk to somebody else is still the sign-out button's job. Do
not wait for the timer to do it.

### Multi-branch owners could be locked out of their own gym

Access is resolved from an owner's `gym_ids` array whenever that field
exists — the scalar `gym_id` is not consulted. Two ways that array could
stop containing the owner's own gym:

- `addBranchToOwner` called `arrayUnion(newGymId)`, and `arrayUnion` on a
  field that doesn't exist yet creates it containing only what you pass. For
  an owner predating the field, adding a second branch replaced their list
  with just the new branch and dropped the gym they were already running.
- Deleting a branch never removed its id from any owner's array, leaving it
  pointing at a gym that no longer existed.

Either way the app pointed its screens at one gym while the server
authorised another, so the owner got "permission denied" on everything with
nothing on screen to explain it. Both causes are fixed, the rules now always
include the scalar `gym_id` as a safety net, and
`scripts/repair-owner-gym-ids.mjs` reports and repairs accounts already
damaged (dry run by default).

### "Couldn't load this member" on a page that loaded fine

Every gym-scoped screen fired its queries from an effect before the active
gym had been resolved — `gymId` was null for one render after sign-in. The
queries were denied, each screen retried, and whichever attempt settled last
won. A refresh could leave a perfectly good page wearing an error banner.
The active gym is now resolved from the first render, which closes the
window for all sixteen screens at once rather than patching them one by one.

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

- The affiliate Settings page has not been exercised against a live affiliate
  account; it builds and mirrors the desk Settings page, but no one has
  signed in and used it.
- One case is unverified by testing: a gym with a **valid future** expiry
  date. The no-subscription case was confirmed against the live project, and
  the rule is written to fail open, but the Firestore emulator needs Java,
  which isn't installed here. Worth one manual check with a real
  subscription before relying on it.
