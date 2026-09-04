// Encryption key for the local SQLite database (BUILD.md §15's "encrypt
// now, OS-tied key" decision). The key itself is 32 random bytes — not a
// human passphrase — so it's applied to SQLCipher via the raw-key pragma
// form (`key="x'<hex>'"`), which skips PBKDF2 derivation entirely (there's
// nothing weak to strengthen; the bytes are already random).
//
// The key is protected at rest by Electron's safeStorage — OS-account-tied
// (Windows DPAPI under the hood), not derived from a GymOS login password.
// Named limitation, worth knowing before this ships: if the Windows
// profile is recreated or the machine reimaged, the wrapped key becomes
// permanently undecryptable. Since Phase 2 has no sync-out yet (Phase 3),
// anything entered offline and not otherwise backed up is lost in that
// scenario. Pairing with BitLocker (OS-level full-disk encryption) is the
// recommended complement, not a substitute — same reasoning as any
// local-first app's inherent limit (see the note on this in BUILD.md).

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const KEY_FILE_NAME = "gymos-local.key";

/**
 * Returns the raw hex SQLCipher key for `db.pragma("key=...")`, generating
 * and wrapping a new one via safeStorage on first run. `userDataDir` is
 * `app.getPath('userData')` — passed in rather than required here so this
 * module stays testable outside a running Electron app (see the
 * standalone verification script's own stand-in for safeStorage).
 */
function getOrCreateKey(userDataDir, safeStorage) {
  const keyPath = path.join(userDataDir, KEY_FILE_NAME);

  if (fs.existsSync(keyPath)) {
    const wrapped = fs.readFileSync(keyPath);
    return safeStorage.decryptString(wrapped);
  }

  if (!safeStorage.isEncryptionAvailable()) {
    // Essentially never false on a real Windows login (DPAPI-backed) —
    // treated as a hard startup failure rather than silently falling back
    // to an unencrypted key, since that would defeat the whole point.
    throw new Error(
      "safeStorage encryption is not available on this machine — cannot create an encrypted local database."
    );
  }

  const hexKey = crypto.randomBytes(32).toString("hex");
  const wrapped = safeStorage.encryptString(hexKey);
  fs.writeFileSync(keyPath, wrapped);
  return hexKey;
}

module.exports = { getOrCreateKey, KEY_FILE_NAME };
