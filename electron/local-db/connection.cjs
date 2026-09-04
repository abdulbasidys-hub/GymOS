// Opens the encrypted local database: applies the SQLCipher key pragma
// FIRST (must be the very first statement on a fresh connection — that's a
// hard SQLCipher requirement, not a style choice), then the standard
// pragma set, then runs migrations.
//
// An SQLCipher connection opened with the WRONG key doesn't fail on the
// `key=` pragma itself — it only fails on the next real read against the
// file ("file is not a database"). So right after setting the key, this
// runs a trivial read in a try/catch specifically to turn that into an
// immediate, clear failure instead of a confusing error surfacing from
// some unrelated query three calls later.

const path = require("node:path");
const Database = require("better-sqlite3-multiple-ciphers");
const { migrate } = require("./schema.cjs");
const { getOrCreateKey } = require("./key.cjs");

const DB_FILE_NAME = "gymos-local.db";

let dbInstance = null;

/**
 * Opens (or returns the already-open) local database. `userDataDir` is
 * `app.getPath('userData')`; `safeStorage` is `require('electron').safeStorage`
 * — both passed in rather than required directly so this module (and the
 * SQL/schema logic it wires together) stays testable outside a running
 * Electron app.
 */
function getConnection(userDataDir, safeStorage) {
  if (dbInstance) return dbInstance;

  const hexKey = getOrCreateKey(userDataDir, safeStorage);
  const dbPath = path.join(userDataDir, DB_FILE_NAME);

  const db = new Database(dbPath);
  db.pragma(`key="x'${hexKey}'"`);

  try {
    db.pragma("user_version"); // the sanity-check read — see file header
  } catch (err) {
    db.close();
    throw new Error(
      "Local database could not be opened — the encryption key on this machine no longer matches the database file."
    );
  }

  db.pragma("foreign_keys = ON");
  db.pragma("journal_mode = WAL");
  db.pragma("busy_timeout = 5000");

  migrate(db);

  dbInstance = db;
  return db;
}

function closeConnection() {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}

module.exports = { getConnection, closeConnection, DB_FILE_NAME };
