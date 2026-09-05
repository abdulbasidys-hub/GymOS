// SQLite schema for the Desk/Owner-relevant collections — one table per
// Firestore collection those two roles touch (see BUILD.md §15). Every
// table carries the same universal columns ledger.js's own comment already
// promises for the Electron phase: id, created_at, actor_uid, sync_status
// — added here even to entities that don't have sync_status in Firestore
// today (members, plans, custom_fields, users), since Phase 3's sync
// engine will need it everywhere, not just on the FACT collections that
// happen to go through appendRecord.
//
// SQLite has no native boolean/JSON/nested-object type — booleans are
// stored as INTEGER 0/1, JSON as TEXT, and Firestore's nested
// `subscription: {...}` map on gyms is flattened into subscription_*
// columns. The matching electron/local-db/*.cjs row-mapper for each table
// undoes this on read so screens get back exactly the shape Firestore
// gives them today — see gyms.cjs for the un-flattening example.
//
// Migrations are gated on PRAGMA user_version so there's a real mechanism
// in place for schema changes later (Phase 3 will need one), even though
// today it's a single "create everything" migration.

const MIGRATIONS = [
  // version 1: initial schema
  (db) => {
    db.exec(`
      CREATE TABLE gyms (
        id TEXT PRIMARY KEY,
        name TEXT,
        prefix TEXT,
        address TEXT,
        status TEXT,
        member_seq INTEGER DEFAULT 0,
        affiliate_id TEXT,
        affiliate_name TEXT,
        country_code TEXT,
        country_name TEXT,
        currency_code TEXT,
        subscription_activated_at TEXT,
        subscription_expiry_date TEXT,
        subscription_grace_hours INTEGER,
        subscription_last_verified_at TEXT,
        subscription_locked INTEGER,
        subscription_plan_id TEXT,
        subscription_plan_name TEXT,
        created_at TEXT,
        actor_uid TEXT,
        sync_status TEXT NOT NULL DEFAULT 'pending'
      );

      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        role TEXT,
        name TEXT,
        username TEXT,
        gym_id TEXT,
        phone TEXT,
        address TEXT,
        email TEXT,
        active INTEGER,
        must_change_password INTEGER,
        created_at TEXT,
        actor_uid TEXT,
        sync_status TEXT NOT NULL DEFAULT 'pending'
      );
      CREATE INDEX idx_users_gym_id ON users(gym_id);

      CREATE TABLE members (
        id TEXT PRIMARY KEY,
        gym_id TEXT,
        member_no TEXT,
        name TEXT,
        phone TEXT,
        dob TEXT,
        gender TEXT,
        weight REAL,
        height REAL,
        date_joined TEXT,
        emergency_name TEXT,
        emergency_phone TEXT,
        email TEXT,
        address TEXT,
        custom_fields TEXT,
        active INTEGER,
        created_at TEXT,
        actor_uid TEXT,
        sync_status TEXT NOT NULL DEFAULT 'pending'
      );
      CREATE INDEX idx_members_gym_id ON members(gym_id);
      CREATE UNIQUE INDEX idx_members_gym_member_no ON members(gym_id, member_no);

      CREATE TABLE plans (
        id TEXT PRIMARY KEY,
        gym_id TEXT,
        type TEXT,
        name TEXT,
        duration_count INTEGER,
        duration_unit TEXT,
        price REAL,
        active INTEGER,
        created_at TEXT,
        actor_uid TEXT,
        sync_status TEXT NOT NULL DEFAULT 'pending'
      );
      CREATE INDEX idx_plans_gym_id ON plans(gym_id);

      CREATE TABLE custom_fields (
        id TEXT PRIMARY KEY,
        gym_id TEXT,
        label TEXT,
        type TEXT,
        required INTEGER,
        active INTEGER,
        created_at TEXT,
        actor_uid TEXT,
        sync_status TEXT NOT NULL DEFAULT 'pending'
      );
      CREATE INDEX idx_custom_fields_gym_id ON custom_fields(gym_id);

      CREATE TABLE payments (
        id TEXT PRIMARY KEY,
        gym_id TEXT,
        member_id TEXT,
        receptionist_uid TEXT,
        plan_id TEXT,
        plan_name TEXT,
        plan_type TEXT,
        amount REAL,
        for_type TEXT,
        duration_count INTEGER,
        duration_unit TEXT,
        paid_at TEXT,
        created_at TEXT,
        actor_uid TEXT,
        sync_status TEXT NOT NULL DEFAULT 'pending',
        adjusts_id TEXT,
        is_adjustment INTEGER DEFAULT 0
      );
      CREATE INDEX idx_payments_gym_id ON payments(gym_id);
      CREATE INDEX idx_payments_gym_member ON payments(gym_id, member_id);

      CREATE TABLE membership_records (
        id TEXT PRIMARY KEY,
        gym_id TEXT,
        member_id TEXT,
        plan_id TEXT,
        plan_name TEXT,
        start_date TEXT,
        expiry_date TEXT,
        payment_id TEXT,
        created_at TEXT,
        actor_uid TEXT,
        sync_status TEXT NOT NULL DEFAULT 'pending',
        adjusts_id TEXT,
        is_adjustment INTEGER DEFAULT 0
      );
      CREATE INDEX idx_membership_records_gym_id ON membership_records(gym_id);
      CREATE INDEX idx_membership_records_gym_member ON membership_records(gym_id, member_id);

      CREATE TABLE equipment_records (
        id TEXT PRIMARY KEY,
        gym_id TEXT,
        member_id TEXT,
        plan_id TEXT,
        plan_name TEXT,
        start_date TEXT,
        expiry_date TEXT,
        payment_id TEXT,
        created_at TEXT,
        actor_uid TEXT,
        sync_status TEXT NOT NULL DEFAULT 'pending',
        adjusts_id TEXT,
        is_adjustment INTEGER DEFAULT 0
      );
      CREATE INDEX idx_equipment_records_gym_id ON equipment_records(gym_id);
      CREATE INDEX idx_equipment_records_gym_member ON equipment_records(gym_id, member_id);

      CREATE TABLE attendance (
        id TEXT PRIMARY KEY,
        gym_id TEXT,
        member_id TEXT,
        receptionist_uid TEXT,
        recorded_at TEXT,
        created_at TEXT,
        actor_uid TEXT,
        sync_status TEXT NOT NULL DEFAULT 'pending',
        adjusts_id TEXT,
        is_adjustment INTEGER DEFAULT 0
      );
      CREATE INDEX idx_attendance_gym_id ON attendance(gym_id);
      CREATE INDEX idx_attendance_gym_member ON attendance(gym_id, member_id);

      CREATE TABLE activity_log (
        id TEXT PRIMARY KEY,
        gym_id TEXT,
        action TEXT,
        target TEXT,
        at TEXT,
        created_at TEXT,
        actor_uid TEXT,
        sync_status TEXT NOT NULL DEFAULT 'pending',
        adjusts_id TEXT,
        is_adjustment INTEGER DEFAULT 0
      );
      CREATE INDEX idx_activity_log_gym_id ON activity_log(gym_id);
    `);
  },

  // version 2 (BUILD.md §15, Phase 3 — push): sync_meta reserves cursor
  // storage for the pull side (next pass) so pull doesn't need its own
  // schema bump later. pending_deletes is a tombstone table — SQLite hard
  // DELETEs (only deleteCustomField today) leave nothing behind to flag
  // 'pending', so the row that WAS deleted gets recorded here instead,
  // and cleared once the matching Firestore deleteDoc is confirmed.
  (db) => {
    db.exec(`
      CREATE TABLE sync_meta (
        gym_id TEXT NOT NULL,
        key TEXT NOT NULL,
        value TEXT,
        PRIMARY KEY (gym_id, key)
      );

      CREATE TABLE pending_deletes (
        table_name TEXT NOT NULL,
        id TEXT NOT NULL,
        gym_id TEXT,
        deleted_at TEXT,
        PRIMARY KEY (table_name, id)
      );
    `);
  },

  // version 3 (BUILD.md §15 — offline authentication): local_credentials
  // lets a staff member sign in on a device WITHOUT network, once they've
  // personally signed in online on that device at least once (that's the
  // only moment a plaintext password is ever seen — captured, hashed,
  // discarded; see electron/local-db/credentials.cjs). Deliberately a
  // separate table from `users`, which mirrors Firestore and flows through
  // the generic sync/push machinery (ALL_TABLES in sync.cjs etc.) — a
  // table those lists never mention makes "a password hash accidentally
  // reaches Firestore" structurally impossible, not just unlikely.
  //
  // local_session is Electron's own source of truth for "who is signed in
  // right now," replacing dependence on Firebase Auth's own persistence
  // for that question — see auth.jsx/accounts.js. One row at a time in
  // practice (a desk device has one active session), not a history table.
  (db) => {
    db.exec(`
      CREATE TABLE local_credentials (
        uid TEXT PRIMARY KEY,
        username TEXT NOT NULL,
        gym_id TEXT,
        password_hash TEXT NOT NULL,
        password_salt TEXT NOT NULL,
        last_online_at TEXT NOT NULL
      );
      CREATE UNIQUE INDEX idx_local_credentials_username ON local_credentials(username);

      CREATE TABLE local_session (
        uid TEXT PRIMARY KEY,
        username TEXT,
        gym_id TEXT,
        signed_in_at TEXT,
        last_activity_at TEXT
      );
    `);
  },

  // version 4 (BUILD.md §6 — multi-branch owners): an owner's `gym_ids`
  // array (every branch they manage — gym_id above stays their permanent
  // "primary" branch). JSON-serialized TEXT, same flattening convention
  // the `subscription` map already uses on `gyms`. Read-only from
  // Electron's side (never locally edited, only ever pulled/bootstrapped
  // from Firestore), so no push-side column is needed — see
  // electron/local-db/users.cjs's rowToUser and pull.cjs's
  // applyPulledUsers.
  (db) => {
    db.exec(`ALTER TABLE users ADD COLUMN gym_ids TEXT;`);
  },

  // version 5: members.photo_url. Member photos shipped on the web side
  // (Firebase Storage upload → photo_url on the member doc, rendered by
  // MemberProfile.jsx) but the local mirror never gained a column for it,
  // so the desktop app dropped the field on every pull and showed the
  // initial-letter fallback for everyone, online or off.
  //
  // The URL is stored, not the image bytes. That is deliberate: the photo
  // lives in Firebase Storage and is fetched over the network, so an
  // offline desk still will not render it — but caching a signed Storage
  // URL is not the same problem as caching the file, and solving the
  // latter means a binary blob store plus its own eviction policy. What
  // this migration buys is that the field survives the round trip and the
  // photo appears the moment the machine is online, instead of never.
  // See BUILD.md §15 for the "offline photos" follow-up this leaves open.
  //
  // Pull-side only, like gym_ids: photo_url is written by the desk's
  // upload flow on the web build, and Electron never edits it locally, so
  // there is no push column to add.
  (db) => {
    db.exec(`ALTER TABLE members ADD COLUMN photo_url TEXT;`);
  },

  // version 6: the member photo BYTES, not just the URL. v5 cached
  // members.photo_url, which is enough to render online but still leaves a
  // genuinely offline desk showing the initial-letter fallback — the image
  // itself was still being fetched from Firebase Storage over the network.
  // This table holds the actual file so a photo behaves like every other
  // piece of gym data: pulled once while online, then available offline
  // indefinitely.
  //
  // BLOB in the SQLite file rather than loose files under userData/ — the
  // database is SQLCipher-encrypted, and a member photo is personal data
  // about a real person, so keeping it inside that encryption boundary is
  // the point, not an accident. It also means the photos are covered by
  // the same single-file backup/wipe story as the rest of the local DB
  // instead of needing their own.
  //
  // `url` is stored alongside so the sync pass can tell "already cached" from
  // "cached, but the member has since uploaded a different photo" — the
  // Storage path is stable per member (member_photos/{gym}/{member}) but the
  // download URL carries a token that changes on re-upload, so a plain
  // "do we have a row?" check would pin the first photo forever.
  // version 7: members.remote_created — does this member exist in Firestore?
  //
  // The push used to answer that with a getDoc on members/{id}, which is
  // DENIED for a member that does not exist yet: firestore.rules' members
  // read rule dereferences resource.data.gym_id, and `resource` is null for
  // a missing document, so the rule errors and the whole push fails before
  // it attempts a single write. Every offline-registered member hit this;
  // the log said "member lookup ... permission-denied" for exactly that
  // reason.
  //
  // A local flag answers the same question with no network call, no rules
  // dependency, and one less round trip per member. Set when a row arrives
  // from Firestore (pull/bootstrap) and when a local create is confirmed
  // pushed. 0 means "never been to the server", which is precisely what
  // decides create-vs-edit.
  (db) => {
    db.exec(`ALTER TABLE members ADD COLUMN remote_created INTEGER NOT NULL DEFAULT 0;`);
    // Anything already marked synced came from, or reached, Firestore.
    db.exec(`UPDATE members SET remote_created = 1 WHERE sync_status = 'synced';`);
  },

  (db) => {
    db.exec(`
      CREATE TABLE member_photos (
        member_id TEXT PRIMARY KEY,
        gym_id TEXT,
        url TEXT,
        content_type TEXT,
        bytes BLOB,
        byte_size INTEGER,
        fetched_at TEXT
      );
      CREATE INDEX idx_member_photos_gym_id ON member_photos(gym_id);
    `);
  },
];

/** Applies every migration newer than the database's current user_version, in order. */
function migrate(db) {
  const current = db.pragma("user_version", { simple: true });
  for (let v = current; v < MIGRATIONS.length; v++) {
    db.transaction(() => {
      MIGRATIONS[v](db);
      db.pragma(`user_version = ${v + 1}`);
    })();
  }
}

module.exports = { migrate };
