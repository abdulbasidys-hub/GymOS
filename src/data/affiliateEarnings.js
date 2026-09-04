// The `affiliate_earnings` collection: one row per platform payment that had
// a commission split, for a gym with an affiliate attached (gyms.js's
// affiliate_id). `payment_amount` and `commission_percent` are frozen at the
// moment of payment — the same "never let a later settings change rewrite
// history" convention as payments.js/platformPayments.js — so a later edit
// to the commission rate (Settings.jsx) never touches money already earned.
//
// Unlike most FACT collections, this one DOES support one controlled update:
// flipping status "pending" -> "paid" once super-admin has actually sent the
// money (Revenue.jsx's monthly payout run).

import {
  collection,
  doc,
  setDoc,
  getDocs,
  writeBatch,
  query,
  where,
  serverTimestamp,
} from "firebase/firestore";
import { db, auth } from "./firebase";

/** Record one affiliate's cut of a gym's platform payment. */
export async function recordAffiliateEarning({
  affiliateId,
  affiliateName,
  gymId,
  gymName,
  platformPaymentId,
  paymentAmount,
  commissionPercent,
}) {
  const ref = doc(collection(db, "affiliate_earnings"));
  const earning = {
    id: ref.id,
    affiliate_id: affiliateId,
    affiliate_name: affiliateName,
    gym_id: gymId,
    gym_name: gymName,
    platform_payment_id: platformPaymentId,
    payment_amount: Number(paymentAmount),
    commission_percent: Number(commissionPercent),
    earned_amount: Math.round((Number(paymentAmount) * Number(commissionPercent)) / 100),
    status: "pending",
    created_at: serverTimestamp(),
    actor_uid: auth.currentUser?.uid ?? null,
  };
  await setDoc(ref, earning);
  return earning;
}

/** One affiliate's own earnings history (their page). */
export async function listEarningsByAffiliate(affiliateId) {
  const snap = await getDocs(query(collection(db, "affiliate_earnings"), where("affiliate_id", "==", affiliateId)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/** Every affiliate's earnings platform-wide (Revenue.jsx's payout export). */
export async function listAllAffiliateEarnings() {
  const snap = await getDocs(query(collection(db, "affiliate_earnings")));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * Close out a payout run for one affiliate — flips every currently-pending
 * earning of theirs to "paid". Called after super-admin has actually sent
 * the money for the period (outside the app — bank transfer, etc.).
 */
export async function markAffiliateEarningsPaid(affiliateId) {
  const snap = await getDocs(
    query(
      collection(db, "affiliate_earnings"),
      where("affiliate_id", "==", affiliateId),
      where("status", "==", "pending")
    )
  );
  const batch = writeBatch(db);
  const paidAt = serverTimestamp();
  for (const d of snap.docs) batch.update(d.ref, { status: "paid", paid_at: paidAt });
  await batch.commit();
}
