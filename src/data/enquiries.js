// The two things a STRANGER can send us: a gym asking about GymOS
// (`gym_enquiries`, from the Contact page) and someone asking to sell it
// (`affiliate_applications`, from Become an affiliate). Super-admin reads
// both on one Inbox page.
//
// THESE ARE THE ONLY PUBLIC WRITES IN THE DATABASE. Everything else requires
// a signed-in account; these two have to accept a document from someone who
// has none, because the whole point is that they can't sign in yet. That
// makes the rules on them the tightest in firestore.rules rather than the
// loosest: an exact field whitelist, a type and a length cap on every
// string, `handled` forced to false and `created_at` forced to the server's
// own clock. A sender cannot write a field we didn't ask for, cannot mark
// their own enquiry handled, and cannot backdate or postdate it.
//
// What that still does NOT prevent, stated plainly: volume. Rules cannot
// rate-limit, so anybody who finds the endpoint can submit repeatedly. The
// real answer is Firebase App Check (attests the request came from our own
// app before it reaches Firestore), which is a console-side setup rather
// than anything this file can do. Until then the exposure is junk rows in an
// inbox, which is annoying rather than dangerous — no read access, no cost
// beyond writes, and delete is one button.
//
// Neither collection is a FACT in the §2.2 sense — an enquiry is
// correspondence, not a record of money or attendance, so deleting one is
// allowed and expected once it's dealt with.

import {
  collection,
  doc,
  addDoc,
  getDocs,
  deleteDoc,
  updateDoc,
  query,
  orderBy,
  serverTimestamp,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { db, storage } from "./firebase";

export const GYM_ENQUIRIES = "gym_enquiries";
export const AFFILIATE_APPLICATIONS = "affiliate_applications";

// Mirrors the caps in firestore.rules. Enforced here too so an over-long
// message is a form error the sender can actually fix, rather than a
// permission-denied they can't interpret.
export const LIMITS = {
  name: 120,
  gymName: 120,
  email: 160,
  phone: 40,
  message: 2000,
};

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

/** A gym asking about GymOS (website Contact form). */
export function submitGymEnquiry({ name, gymName, email, message }) {
  return addDoc(collection(db, GYM_ENQUIRIES), {
    name: String(name).trim().slice(0, LIMITS.name),
    gym_name: String(gymName).trim().slice(0, LIMITS.gymName),
    email: String(email).trim().slice(0, LIMITS.email),
    message: String(message).trim().slice(0, LIMITS.message),
    handled: false,
    created_at: serverTimestamp(),
  });
}

/**
 * Put an applicant's photo in Storage and return its PATH, not its URL.
 *
 * The path is deliberate. getDownloadURL() is itself a read, and the
 * applicant has write-only access to this folder (they're not signed in —
 * letting them read it would make every applicant's photo world-readable to
 * anyone who guessed a name). So the document stores the path, and
 * super-admin — who does have read — resolves it to a URL when the Inbox
 * renders it. See applicantPhotoUrl below.
 *
 * The filename is randomised rather than derived from the person's name:
 * `crypto.randomUUID()` means two applicants called the same thing can't
 * collide, and nobody can overwrite somebody else's photo by guessing a
 * path (the rules allow create but not update, so a collision would be a
 * hard failure rather than a silent replacement).
 */
export async function uploadApplicantPhoto(file) {
  if (file.size > MAX_PHOTO_BYTES) {
    throw new Error("That image is over 5MB. Please choose a smaller one.");
  }
  if (!file.type?.startsWith("image/")) {
    throw new Error("Please choose an image file.");
  }
  const path = `affiliate_photos/${crypto.randomUUID()}`;
  await uploadBytes(ref(storage, path), file, { contentType: file.type });
  return path;
}

/** Someone asking to become an affiliate marketer. `photoPath` comes from
 *  uploadApplicantPhoto — upload first, then create the document, so there
 *  is never a public UPDATE to attach the photo afterwards. */
export function submitAffiliateApplication({ name, phone, email, photoPath }) {
  return addDoc(collection(db, AFFILIATE_APPLICATIONS), {
    name: String(name).trim().slice(0, LIMITS.name),
    phone: String(phone).trim().slice(0, LIMITS.phone),
    email: String(email).trim().slice(0, LIMITS.email),
    photo_path: photoPath,
    handled: false,
    created_at: serverTimestamp(),
  });
}

/** Newest first — an inbox is read from the top. */
async function listNewestFirst(name) {
  const snap = await getDocs(query(collection(db, name), orderBy("created_at", "desc")));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export function listGymEnquiries() {
  return listNewestFirst(GYM_ENQUIRIES);
}

export function listAffiliateApplications() {
  return listNewestFirst(AFFILIATE_APPLICATIONS);
}

/** Mark one dealt with (or put it back). `handled` is the only field
 *  super-admin ever changes — the submission itself is the sender's words
 *  and stays as they wrote it. */
export function setEnquiryHandled(collectionName, id, handled) {
  return updateDoc(doc(db, collectionName, id), { handled: !!handled });
}

/** Resolve a stored photo path to a URL super-admin can render. */
export function applicantPhotoUrl(path) {
  return getDownloadURL(ref(storage, path));
}

/** Throw an enquiry away. For an application, its photo goes too — leaving
 *  the object behind would be paid-for storage nothing references. */
export async function deleteEnquiry(collectionName, id, photoPath) {
  if (photoPath) {
    try {
      await deleteObject(ref(storage, photoPath));
    } catch (err) {
      // An already-missing object must not block deleting the row, or the
      // inbox grows entries that can never be cleared.
      console.error("Couldn't delete applicant photo at", photoPath, err);
    }
  }
  return deleteDoc(doc(db, collectionName, id));
}
