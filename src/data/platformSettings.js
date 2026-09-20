// The `platform_settings` collection: a single document ("config") holding
// platform-wide numbers that aren't tied to any one gym. Currently just the
// affiliate commission rate (Settings.jsx) — the DEFAULT cut an affiliate
// marketer earns on a payment from a gym they referred (Subscriptions.jsx),
// used for any affiliate who has no rate of their own on their `users` doc.
// logic/commission.js owns the precedence between the two.

import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "./firebase";
import { clampCommissionPercent } from "../logic/commission";

const SETTINGS_REF = doc(db, "platform_settings", "config");

/** Read platform settings. Defaults to 0% commission if never configured. */
export async function getPlatformSettings() {
  const snap = await getDoc(SETTINGS_REF);
  return snap.exists() ? snap.data() : { affiliate_commission_percent: 0 };
}

/** Set the DEFAULT percentage of a gym's platform payment an affiliate
 *  earns — the rate used for every affiliate who has no rate of their own
 *  (logic/commission.js). Clamped to MAX_COMMISSION_PERCENT here as well as
 *  in the form, since this is the last point the app controls before the
 *  number reaches Firestore. */
export function setAffiliateCommissionPercent(percent) {
  return setDoc(
    SETTINGS_REF,
    { affiliate_commission_percent: clampCommissionPercent(percent) },
    { merge: true }
  );
}
