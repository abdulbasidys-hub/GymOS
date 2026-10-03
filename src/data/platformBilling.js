// Where a gym sends money for GymOS itself: the platform's own bank account,
// set by super-admin and read by owners on their Settings page.
//
// A SEPARATE COLLECTION from platform_settings, deliberately, and this is the
// whole reason the file exists rather than being two more fields over there.
// platform_settings holds the affiliate commission rate — a company-internal
// number no gym should ever see — and its read rule is super-admin only.
// Widening that rule so owners could see the bank details would have handed
// them the commission rate in the same breath. One document per audience is
// the fix; nothing here is secret, and nothing there is shared.
//
// Read by any signed-in user rather than owners alone: these are the details
// we hand to anybody who owes us money, and a marketer helping a gym pay
// should be able to read them off their own screen rather than asking.

import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { db, auth } from "./firebase";

const BILLING_REF = doc(db, "platform_billing", "account");

/** The platform's payment details. Empty object when never configured —
 *  the screens treat that as "not set up yet" rather than an error. */
export async function getPlatformBilling() {
  const snap = await getDoc(BILLING_REF);
  return snap.exists() ? snap.data() : {};
}

/**
 * Set them. Every field is optional on purpose: a provider part-way through
 * filling this in should not be blocked, and the owner's screen already
 * renders whatever is missing as "not set". Trimmed here so a trailing space
 * copied out of a banking app does not end up in an account number somebody
 * pastes into a transfer.
 */
export function setPlatformBilling({ bankName, accountName, accountNumber, notes }) {
  return setDoc(
    BILLING_REF,
    {
      bank_name: String(bankName ?? "").trim(),
      account_name: String(accountName ?? "").trim(),
      account_number: String(accountNumber ?? "").trim(),
      notes: String(notes ?? "").trim(),
      updated_at: serverTimestamp(),
      updated_by: auth.currentUser?.uid ?? null,
    },
    { merge: true }
  );
}
