// Member photos ("passports" — a headshot, not a travel document) —
// stored in Firebase Storage at member_photos/{gymId}/{memberId}, one
// current photo per member (re-uploading overwrites it), with the
// resulting download URL saved onto the member's own Firestore doc as
// `photo_url` (see members.js / firestore.rules' bio-data allow-list).
//
// Deliberately NOT routed through the Electron local-first bridge the way
// every other member write is (data/local/) — there's no local file-sync
// story for binary blobs yet, and a photo upload needs a live connection
// either way, so this always talks to Firebase directly, online or not. A
// photo was never required at registration (some gyms collect one, some
// don't, some collect it later) and can always be added or replaced from
// the member's profile — a failed upload here just leaves photo_url unset,
// nothing else about the member is affected.

import { doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "./firebase";
import { localInvoke } from "./local/bridge";
import { cacheJustUploadedPhoto } from "./local/photoCache";

const MAX_BYTES = 5 * 1024 * 1024;

/** Upload (or replace) a member's photo, and save its URL onto their record. */
export async function uploadMemberPhoto(gymId, memberId, file) {
  if (!file.type?.startsWith("image/")) throw new Error("Choose an image file.");
  if (file.size > MAX_BYTES) throw new Error("Image must be under 5MB.");

  const photoRef = ref(storage, `member_photos/${gymId}/${memberId}`);
  await uploadBytes(photoRef, file, { contentType: file.type });
  const url = await getDownloadURL(photoRef);
  // updated_at alongside photo_url so the Electron pull's updated_at
  // cursor sees this edit — without it a photo added here would reach
  // Firestore but never propagate to other desks (see data/local/pull.js).
  await updateDoc(doc(db, "members", memberId), {
    photo_url: url,
    updated_at: serverTimestamp(),
  });

  // Firestore is the authority and has just accepted the write; this only
  // mirrors the result onto Electron's local row so the photo appears on
  // this device now. Without it the desktop app would show the
  // initial-letter fallback until the local database happened to be
  // reseeded — the incremental pull walks `created_at`, so it never
  // revisits a member it has already imported (see data/local/pull.js).
  //
  // Best-effort: the authoritative write already succeeded, so a failure
  // here is a stale local cache, not a lost photo, and must not surface as
  // "Couldn't upload this photo."
  if (window.gymOS?.isElectron) {
    try {
      await localInvoke("setMemberPhotoUrl", { memberId, photoUrl: url });
    } catch (err) {
      console.error("Photo uploaded but local mirror not updated:", err);
    }
    // Cache the file we already have in hand rather than making the sync
    // pass download back the very bytes just uploaded.
    await cacheJustUploadedPhoto(memberId, gymId, url, file);
  }

  return url;
}
