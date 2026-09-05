import { useState } from "react";
import Modal from "./Modal";

// Asks for the password before a manual sync (Electron only).
//
// Why a password every time, rather than trusting the session already in
// hand: auth.currentUser is a LOCAL CACHE. Firebase restores it from
// storage without asking the server, so the app can believe someone is
// signed in while the token behind it has been revoked and every write is
// refused. Re-signing in from the password is the one action that always
// produces a provably current token — no detection, no recovery path, no
// silent half-broken state.
//
// It also fits how the desk actually works: sync is now a deliberate act
// after reconnecting, not a background timer, so there is a person present
// to type it. Records were already saved locally the moment they were
// entered — this gates when they LEAVE the device, never whether they were
// kept.
export default function SyncPasswordModal({ open, busy, error, onSubmit, onClose }) {
  const [password, setPassword] = useState("");

  function submit(e) {
    e.preventDefault();
    if (!password) return;
    onSubmit(password);
  }

  function close() {
    setPassword("");
    onClose();
  }

  return (
    <Modal open={open} title="Enter your password to sync" onClose={close}>
      <form onSubmit={submit} className="sync-password">
        <label className="field">
          <span>Password</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            autoFocus
            required
          />
        </label>

        {error && <p className="form-error">{error}</p>}

        <button className="btn btn--primary" type="submit" disabled={busy || !password}>
          {busy ? "Syncing…" : "Sync now"}
        </button>
      </form>
    </Modal>
  );
}
