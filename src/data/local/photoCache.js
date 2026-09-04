// Keeping member photos available offline, the same way every other piece
// of gym data already is (BUILD.md §15). members.photo_url tells the app
// WHERE a photo lives; this pass makes sure the file itself is on the
// machine, so a desk with no connection shows the member's face instead of
// the initial-letter fallback.
//
// The actual download and the BLOB write both happen in the main process —
// see electron/local-db/memberPhotos.cjs for why (Firebase Storage URLs
// are not CORS-enabled, and the renderer runs from file://). Everything
// here is orchestration: work out which photos are missing, then ask main
// to fetch them.

import { localInvoke } from "./bridge";

// Photos are fetched a few per sync cycle rather than all at once. A gym
// onboarding hundreds of members with photos would otherwise fire hundreds
// of parallel downloads on the first cycle after bootstrap — saturating a
// bad connection and competing with the record sync that actually matters
// for taking payments and checking people in. The backlog drains over
// subsequent cycles; nothing is lost, it just arrives over minutes rather
// than seconds.
const MAX_DOWNLOADS_PER_CYCLE = 8;

/** Downloads any member photos this device is missing or that have been
 *  replaced since it last looked. No-op outside Electron (the web app
 *  streams photos straight from Storage and has no local store) and
 *  best-effort throughout: a photo that fails today is simply retried on
 *  the next cycle, and never blocks the record sync it runs alongside. */
export async function syncMemberPhotos(gymId) {
  if (!window.gymOS?.isElectron || !gymId) return;

  try {
    const [members, cached] = await Promise.all([
      localInvoke("listMembers", { gymId }),
      localInvoke("listCachedPhotoUrls", { gymId }),
    ]);

    // A changed URL means a re-upload: the Storage path is stable per
    // member, but its download token is not, so comparing URLs (rather
    // than just checking a row exists) is what catches a replaced photo.
    const stale = (members || []).filter((m) => m.photo_url && cached[m.id] !== m.photo_url);
    if (stale.length === 0) return;

    for (const member of stale.slice(0, MAX_DOWNLOADS_PER_CYCLE)) {
      try {
        await localInvoke("cacheMemberPhoto", {
          memberId: member.id,
          gymId,
          url: member.photo_url,
        });
      } catch (err) {
        console.error(`Couldn't cache photo for member ${member.id}:`, err);
      }
    }
  } catch (err) {
    console.error("Member photo sync failed (will retry next cycle):", err);
  }
}

/** The right <img src> for a member on this build: the locally cached file
 *  when Electron has one, otherwise the remote URL, otherwise null so the
 *  caller renders its initial-letter fallback. Always returns the remote
 *  URL unchanged on the web. */
export async function resolveMemberPhotoSrc(member) {
  if (!member) return null;
  if (!window.gymOS?.isElectron) return member.photo_url || null;

  try {
    const cachedPhoto = await localInvoke("getMemberPhoto", { memberId: member.id });
    // Only trust the cache if it holds THIS photo — a stale row from before
    // a re-upload would otherwise show the old picture indefinitely, which
    // is worse than showing nothing.
    if (cachedPhoto?.data_url && (!member.photo_url || cachedPhoto.url === member.photo_url)) {
      return cachedPhoto.data_url;
    }
  } catch (err) {
    console.error("Couldn't read cached member photo:", err);
  }

  return member.photo_url || null;
}

/** Stores a just-uploaded photo without re-downloading it — the file is
 *  already in hand, and Storage has already accepted it. Best-effort: the
 *  authoritative upload has succeeded by the time this runs, so a failure
 *  here means a cache miss the next sync cycle repairs, not a lost photo. */
export async function cacheJustUploadedPhoto(memberId, gymId, url, file) {
  if (!window.gymOS?.isElectron) return;
  try {
    const base64 = await fileToBase64(file);
    await localInvoke("putMemberPhoto", {
      memberId,
      gymId,
      url,
      contentType: file.type || "image/jpeg",
      base64,
    });
  } catch (err) {
    console.error("Photo uploaded but not cached locally:", err);
  }
}

/** File -> bare base64 (no data: prefix), which is what the IPC boundary
 *  and Buffer.from(..., "base64") on the main side expect. */
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const result = String(reader.result || "");
      const comma = result.indexOf(",");
      resolve(comma === -1 ? result : result.slice(comma + 1));
    };
    reader.readAsDataURL(file);
  });
}
