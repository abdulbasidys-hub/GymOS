// The affiliate commission rate: where a given affiliate's rate comes from,
// and the one hard ceiling on it.
//
// TWO places can set a rate, and the order between them matters:
//
//   1. `platform_settings.affiliate_commission_percent` — the DEFAULT,
//      edited on super-admin Settings. Applies to every affiliate who has
//      no rate of their own.
//   2. `commission_percent` on an affiliate's own `users` doc — edited on
//      their detail page. Overrides the default, for their referrals only.
//
// "No rate of their own" means the field is absent, null, or not a finite
// number. That is deliberately NOT the same as 0: an absent field means
// "follow the default, whatever it happens to be", while 0 is a real
// decision that this particular affiliate earns nothing. Keeping them
// distinct is the whole reason the override is nullable rather than
// defaulting to zero — every affiliate registered before this existed has
// no field at all, and they all keep tracking the default exactly as they
// did when the default was the only number in the system.
//
// A rate is only ever READ at the moment a payment is recorded, and the
// result is frozen onto the earning row (affiliateEarnings.js). Changing
// either number here never rewrites money already earned.

/** The ceiling, for both the default and any individual override.
 *  Deliberately a shared constant rather than a literal repeated in each
 *  form: the cap is only real if every write path uses the same number,
 *  and firestore.rules enforces this same 50 server-side so a hand-edited
 *  request can't go around the dropdowns. */
export const MAX_COMMISSION_PERCENT = 50;

/** Coerce anything into a usable percentage: a finite number, 0..MAX.
 *  Junk becomes 0 rather than throwing — a broken rate that pays nothing
 *  is recoverable, one that pays NaN or 90% is not. */
export function clampCommissionPercent(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.min(Math.max(num, 0), MAX_COMMISSION_PERCENT);
}

/** Does this affiliate have a rate of their own, or do they follow the
 *  default? `affiliate` is their `users` doc. */
export function hasOwnCommissionRate(affiliate) {
  const raw = affiliate?.commission_percent;
  return raw !== null && raw !== undefined && Number.isFinite(Number(raw));
}

/** The rate that actually applies to this affiliate — their own if they
 *  have one, otherwise the platform default. Both are clamped on the way
 *  out, so a value stored before the cap existed (or written around the
 *  UI) can never pay out above MAX. */
export function resolveCommissionPercent(affiliate, defaultPercent) {
  return clampCommissionPercent(
    hasOwnCommissionRate(affiliate) ? affiliate.commission_percent : defaultPercent
  );
}

/** The values a commission dropdown offers: whole percents, 0..MAX.
 *
 *  `current` is the value stored right now. It's folded in when it isn't
 *  already on the list — the rate was a free-text number field before this
 *  (0.5 steps were allowed), so a real stored 7.5 has to remain selectable or
 *  merely opening the form and saving would quietly round somebody's rate.
 *  A stored value above MAX is NOT folded in: that one should be corrected,
 *  not preserved. */
export function commissionOptions(current) {
  const options = [];
  for (let p = 0; p <= MAX_COMMISSION_PERCENT; p += 1) options.push(p);
  const num = Number(current);
  if (Number.isFinite(num) && num >= 0 && num <= MAX_COMMISSION_PERCENT && !options.includes(num)) {
    options.push(num);
    options.sort((a, b) => a - b);
  }
  return options;
}
