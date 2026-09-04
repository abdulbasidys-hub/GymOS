// Offline storage for member photo FILES (schema.cjs migration v6).
// members.photo_url only records where a photo lives; this holds the image
// itself, so the desk shows a member's face with no network at all.
//
// The download happens HERE, in the main process, and that is the whole
// reason this file exists rather than the renderer fetching the bytes
// itself: Firebase Storage download URLs are served without CORS headers
// unless the bucket is explicitly configured for it, and Electron's
// renderer runs from a file:// origin. An <img src> renders fine (image
// loads are not CORS-gated) but fetch() from the renderer would be
// blocked. Node's fetch in the main process has no such restriction, so
// nothing about the bucket's CORS configuration has to change.

const MAX_PHOTO_BYTES = 5 * 1024 * 1024; // matches the upload cap in src/data/memberPhotos.js

function nowIso() {
  return new Date().toISOString();
}

/** The cached photo as a data: URL, ready to drop straight into an <img
 *  src>. Returns null when nothing is cached, so callers can fall back to
 *  the remote URL (online) or the initial-letter badge (offline). */
function getMemberPhoto(db, { memberId }) {
  const row = db
    .prepare("SELECT member_id, url, content_type, bytes FROM member_photos WHERE member_id = ?")
    .get(memberId);
  if (!row || !row.bytes) return null;
  const base64 = Buffer.from(row.bytes).toString("base64");
  return {
    member_id: row.member_id,
    url: row.url,
    data_url: `data:${row.content_type || "image/jpeg"};base64,${base64}`,
  };
}

/** { [memberId]: url } for one gym — what the sync pass diffs against the
 *  members table to decide which photos still need downloading. Deliberately
 *  does NOT select `bytes`: this runs over every member each cycle, and
 *  pulling megabytes of BLOBs across IPC just to compare URL strings would
 *  make the check more expensive than the work it is avoiding. */
function listCachedPhotoUrls(db, { gymId }) {
  const rows = db.prepare("SELECT member_id, url FROM member_photos WHERE gym_id = ?").all(gymId);
  const out = {};
  for (const row of rows) out[row.member_id] = row.url;
  return out;
}

/** Download one photo and store it. Called only when the sync pass has
 *  already decided this member's photo is missing or out of date. */
async function cacheMemberPhoto(db, { memberId, gymId, url }) {
  if (!url) return { ok: false, reason: "no_url" };

  const response = await fetch(url);
  if (!response.ok) return { ok: false, reason: `http_${response.status}` };

  const buffer = Buffer.from(await response.arrayBuffer());
  // The uploader already enforces this cap, so exceeding it means the file
  // predates that check or came from elsewhere. Skipped rather than stored:
  // the member still renders from the remote URL when online, and the local
  // database does not silently balloon.
  if (buffer.length > MAX_PHOTO_BYTES) return { ok: false, reason: "too_large" };

  db.prepare(
    `INSERT INTO member_photos (member_id, gym_id, url, content_type, bytes, byte_size, fetched_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(member_id) DO UPDATE SET
       gym_id = excluded.gym_id,
       url = excluded.url,
       content_type = excluded.content_type,
       bytes = excluded.bytes,
       byte_size = excluded.byte_size,
       fetched_at = excluded.fetched_at`
  ).run(
    memberId,
    gymId ?? null,
    url,
    response.headers.get("content-type") || "image/jpeg",
    buffer,
    buffer.length,
    nowIso()
  );

  return { ok: true, bytes: buffer.length };
}

/** Stores bytes the renderer already holds — the upload path, where the
 *  file was just picked from disk and there is nothing to download. */
function putMemberPhoto(db, { memberId, gymId, url, contentType, base64 }) {
  const buffer = Buffer.from(base64, "base64");
  if (buffer.length > MAX_PHOTO_BYTES) return { ok: false, reason: "too_large" };
  db.prepare(
    `INSERT INTO member_photos (member_id, gym_id, url, content_type, bytes, byte_size, fetched_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(member_id) DO UPDATE SET
       gym_id = excluded.gym_id,
       url = excluded.url,
       content_type = excluded.content_type,
       bytes = excluded.bytes,
       byte_size = excluded.byte_size,
       fetched_at = excluded.fetched_at`
  ).run(memberId, gymId ?? null, url ?? null, contentType || "image/jpeg", buffer, buffer.length, nowIso());
  return { ok: true, bytes: buffer.length };
}

/** Total bytes of cached photos for a gym — surfaced in the sync UI so the
 *  disk cost of this cache is visible rather than silently growing. */
function getPhotoCacheSize(db, { gymId }) {
  const row = db
    .prepare("SELECT COUNT(*) AS count, COALESCE(SUM(byte_size), 0) AS total FROM member_photos WHERE gym_id = ?")
    .get(gymId);
  return { count: row?.count ?? 0, bytes: row?.total ?? 0 };
}

module.exports = {
  getMemberPhoto,
  listCachedPhotoUrls,
  cacheMemberPhoto,
  putMemberPhoto,
  getPhotoCacheSize,
};
