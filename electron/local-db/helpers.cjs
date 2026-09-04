// Small shared utilities for the local-db layer — the SQLite-side mirror
// of a few conventions src/lib/helpers.js already establishes for the
// Firestore side (stripUndefined in particular is copied verbatim; SQLite
// doesn't reject undefined the way Firestore does, but running writes
// through it anyway keeps the two paths' behavior visibly matched rather
// than silently diverging).

const crypto = require("node:crypto");

function newId() {
  return crypto.randomUUID();
}

function nowIso() {
  return new Date().toISOString();
}

function stripUndefined(obj) {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));
}

/** SQLite has no boolean type — 0/1 in, real true/false out. */
function toBool(v) {
  return !!v;
}
function fromBool(v) {
  return v ? 1 : 0;
}

/** `undefined` -> SQL NULL is what better-sqlite3 already does; this just
 *  normalizes a JS boolean/undefined into the 0/1/NULL a column expects. */
function fromBoolOrNull(v) {
  return v === undefined || v === null ? null : v ? 1 : 0;
}

module.exports = { newId, nowIso, stripUndefined, toBool, fromBool, fromBoolOrNull };
