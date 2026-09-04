// The `platform_settings` collection: a single document ("config") holding
// platform-wide numbers that aren't tied to any one gym. Currently just the
// affiliate commission rate (Settings.jsx) — the cut an affiliate marketer
// earns on a payment from a gym they referred (Subscriptions.jsx).

import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "./firebase";

const SETTINGS_REF = doc(db, "platform_settings", "config");

/** Read platform settings. Defaults to 0% commission if never configured. */
export async function getPlatformSettings() {
  const snap = await getDoc(SETTINGS_REF);
  return snap.exists() ? snap.data() : { affiliate_commission_percent: 0 };
}

/** Set the percentage of a gym's platform payment an affiliate earns. */
export function setAffiliateCommissionPercent(percent) {
  return setDoc(SETTINGS_REF, { affiliate_commission_percent: Number(percent) }, { merge: true });
}
