// The `downloads` collection: the desktop installer and the PDF guides
// that owners and receptionists fetch for themselves from the browser,
// so a customer who isn't sitting with the super admin can still get set
// up. Super admin writes; every signed-in user reads (firestore.rules).
//
// Fixed document ids, not generated ones — there is exactly one current
// installer and one current guide per role, and "replace the installer"
// should overwrite that single row rather than accumulate a history of
// stale versions that the download page would then have to sort through.
//
// EACH ENTRY IS EITHER AN UPLOAD OR A LINK, deliberately:
//
//   - Uploaded (Firebase Storage) suits the guides. They're small PDFs;
//     a few MB each costs nothing.
//
//   - An external URL suits the INSTALLER, and this matters. It's ~120MB.
//     Firebase Storage's free tier allows 1GB of egress per DAY, so about
//     eight downloads before the project starts refusing them (or billing,
//     on Blaze). A GitHub Release serves the same file free and unmetered.
//     Paste that link instead of uploading and the download page behaves
//     identically — same button, same UX — while the bandwidth lands
//     somewhere built for it.
//
// `storage_path` records where an uploaded file lives so replacing it can
// overwrite the same object; it stays null for link-only entries, which is
// how removeDownload knows whether there's anything in Storage to delete.

import { doc, getDoc, getDocs, collection, setDoc, deleteDoc, serverTimestamp } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { db, storage, auth } from "./firebase";

/** The three things that can be published, in the order the pages show
 *  them. `roles` is who sees each one on their own downloads page.
 *
 *  `webOnly` hides an entry inside the desktop app itself. Offering "download
 *  the desktop app" to someone already running the desktop app is noise at
 *  best and confusing at worst — the installer is for getting a NEW machine
 *  set up, which by definition happens in a browser. The guides carry no
 *  such flag: they're just as useful to read at the desk as anywhere else. */
export const DOWNLOAD_KINDS = [
  {
    id: "desktop_app",
    label: "GymOS desktop app",
    hint: "The Windows installer. Large — prefer a GitHub Release link over uploading.",
    roles: ["owner", "receptionist"],
    webOnly: true,
  },
  {
    id: "guide_owner",
    label: "Owner's guide",
    hint: "Covers the owner dashboard and how the front desk works.",
    roles: ["owner"],
  },
  {
    id: "guide_reception",
    label: "Receptionist's guide",
    hint: "Front-desk only: check-ins, registering members, taking payments.",
    roles: ["receptionist"],
  },
];

const MAX_UPLOAD_BYTES = 200 * 1024 * 1024;

export async function listDownloads() {
  const snap = await getDocs(collection(db, "downloads"));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function getDownload(id) {
  const snap = await getDoc(doc(db, "downloads", id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

/** Publish (or replace) an entry that points at a file hosted elsewhere. */
export async function setDownloadLink(id, { url, fileName, version, notes }) {
  const existing = await getDownload(id);
  // Switching an entry from an upload to a link leaves the old object
  // orphaned in Storage otherwise — nothing else would ever reference it.
  if (existing?.storage_path) await deleteStoredFile(existing.storage_path);

  return writeEntry(id, {
    url: url.trim(),
    file_name: fileName?.trim() || null,
    version: version?.trim() || null,
    notes: notes?.trim() || null,
    size_bytes: null,
    storage_path: null,
  });
}

/** Publish (or replace) an entry by uploading the file to Storage. */
export async function uploadDownload(id, file, { version, notes } = {}) {
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error("File is over 200MB. Host it externally and paste the link instead.");
  }

  // Fixed path per kind, so re-uploading replaces the object rather than
  // leaving the previous version behind to be paid for forever.
  const storagePath = `downloads/${id}`;
  const fileRef = ref(storage, storagePath);
  await uploadBytes(fileRef, file, { contentType: file.type || "application/octet-stream" });
  const url = await getDownloadURL(fileRef);

  return writeEntry(id, {
    url,
    file_name: file.name,
    version: version?.trim() || null,
    notes: notes?.trim() || null,
    size_bytes: file.size,
    storage_path: storagePath,
  });
}

/** Unpublish an entry, removing the Storage object if it owned one. */
export async function removeDownload(id) {
  const existing = await getDownload(id);
  if (existing?.storage_path) await deleteStoredFile(existing.storage_path);
  await deleteDoc(doc(db, "downloads", id));
}

async function writeEntry(id, fields) {
  const payload = {
    ...fields,
    updated_at: serverTimestamp(),
    updated_by: auth.currentUser?.uid ?? null,
  };
  await setDoc(doc(db, "downloads", id), payload);
  return { id, ...payload };
}

/** Best-effort: an already-missing object must not fail the write that
 *  replaces it, or a half-cleaned entry becomes unrepairable from the UI. */
async function deleteStoredFile(path) {
  try {
    await deleteObject(ref(storage, path));
  } catch (err) {
    console.error("Couldn't delete previous file at", path, err);
  }
}
