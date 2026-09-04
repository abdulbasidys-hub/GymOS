// Small generic helpers. No UI, no storage.

/**
 * Firestore rejects writes containing `undefined` field values with an
 * `invalid-argument` error. Run every write object through this first.
 */
export function stripUndefined(obj) {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined)
  );
}

/** Format an amount as Nigerian Naira, e.g. 5000 -> "₦5,000". Used for
 * PLATFORM-level money (platform_plans/platform_payments/affiliate
 * commissions) — deliberately one fixed currency regardless of any one
 * gym's own currency, since super-admin aggregates these ACROSS gyms and
 * summing different currencies together without real FX conversion (which
 * this app doesn't do) would be meaningless. See formatMoney below for the
 * gym-currency-aware version used everywhere a GYM's own money is shown
 * (their plans, their members' payments, their revenue reports). */
export function naira(amount) {
  return "₦" + Number(amount || 0).toLocaleString("en-NG");
}

/**
 * Format an amount in a given ISO 4217 currency code, e.g.
 * formatMoney(5000, "KES", "KE") -> "Ksh 5,000". `countryCode` (ISO 3166-1
 * alpha-2) picks the formatting LOCALE, not just the currency — the same
 * currency renders differently by region (grouping separators, whether a
 * recognisable symbol exists at all), and Intl only picks the right one when
 * the region tag matches, e.g. "en-ZA"/ZAR -> "R 15 000" vs generic
 * "en"/ZAR -> "ZAR 15,000". Defaults to NGN/NG so gyms created before this
 * field existed (currency_code/country_code absent on their doc) render
 * exactly as they always have. Falls back to naira() if the currency code
 * is invalid/unrecognised rather than throwing.
 */
export function formatMoney(amount, currencyCode, countryCode) {
  const n = Number(amount) || 0;
  const currency = currencyCode || "NGN";
  const region = countryCode || "NG";
  try {
    return new Intl.NumberFormat(`en-${region}`, {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(n);
  } catch {
    return naira(n);
  }
}

// GymOS logs in with USERNAMES, not raw emails. Firebase Auth requires an
// email-shaped identifier, so every username maps to a fixed internal domain.
// No email is ever sent here — it's purely an identifier — so this domain does
// NOT need to be a real, deliverable mailbox. It only has to stay constant and
// match the addresses used when accounts are created.
//
// Change this ONE line if you want to use your own domain (and create the
// admin Auth user to match, e.g. admin@<your-domain>).
export const AUTH_EMAIL_DOMAIN = "gymos.app";

/** Turn a username into the internal email Firebase Auth expects. */
export function usernameToEmail(username) {
  return `${String(username).trim().toLowerCase()}@${AUTH_EMAIL_DOMAIN}`;
}

// Every new owner/receptionist account starts on this SAME password (a
// deliberate choice — see data/users.js). Firebase Auth requires 6+
// characters; this satisfies that. Whoever creates the account is trusted to
// tell the new user this default out of band (or it's just internal
// knowledge). must_change_password forces it to be replaced before the
// account can do anything else (see SetPasswordPage.jsx).
export const DEFAULT_PASSWORD = "Welcome123";

/**
 * Normalise a Firestore Timestamp, JS Date, ISO string, or millis into a JS
 * Date. Returns null for anything empty (e.g. a serverTimestamp() sentinel
 * that hasn't resolved locally yet).
 */
export function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value.toDate === "function") return value.toDate(); // Firestore Timestamp
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Format a value (see toDate) as a readable date + time, e.g. "22 Jul 2026, 14:05". */
export function formatDateTime(value) {
  const d = toDate(value);
  return d
    ? d.toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" })
    : "—";
}

/** Format a value (see toDate) as a readable date only, e.g. "22 Jul 2026". */
export function formatDate(value) {
  const d = toDate(value);
  return d ? d.toLocaleDateString("en-NG", { dateStyle: "medium" }) : "—";
}

/** Midnight (local time) on the same day as `d`. */
export function startOfDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/**
 * Capitalize a string's first letter — for displaying stored lowercase
 * values (plan types, duration units, license status) as proper UI text
 * without changing the stored value itself (rules/logic keep matching on
 * the lowercase form).
 */
export function capitalize(s) {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}
