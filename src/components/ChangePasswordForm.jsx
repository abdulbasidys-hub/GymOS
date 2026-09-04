import { useState } from "react";
import { changePassword } from "../data";

// Self-contained, works from any role's Settings surface (owner/
// GymSettings.jsx, admin/Settings.jsx, the affiliate and desk settings
// popups). Asks for the current password so it can re-authenticate before
// Firebase's updatePassword call, which requires a recent sign-in.
// `showTitle` is false when a caller already wraps this in a Modal titled
// "Change password" — otherwise the heading repeats right below it.
export default function ChangePasswordForm({ showTitle = true }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError("");
    setSaved(false);
    if (!currentPassword) return setError("Enter your current password.");
    if (newPassword.length < 6) return setError("New password must be at least 6 characters.");
    if (newPassword !== confirm) return setError("New passwords don't match.");

    setBusy(true);
    try {
      await changePassword(currentPassword, newPassword);
      setSaved(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirm("");
    } catch (err) {
      console.error(err);
      setError(
        err?.code === "auth/wrong-password" || err?.code === "auth/invalid-credential"
          ? "Current password is incorrect."
          : "Couldn't change your password."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      {showTitle && <h2>Change password</h2>}
      <form onSubmit={submit}>
        <label className="field">
          <span>Current password</span>
          <input
            type="password"
            value={currentPassword}
            onChange={(e) => {
              setCurrentPassword(e.target.value);
              setSaved(false);
            }}
            autoComplete="current-password"
            required
          />
        </label>
        <div className="row2 row2--even">
          <label className="field">
            <span>New password</span>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => {
                setNewPassword(e.target.value);
                setSaved(false);
              }}
              autoComplete="new-password"
              required
            />
          </label>
          <label className="field">
            <span>Confirm new password</span>
            <input
              type="password"
              value={confirm}
              onChange={(e) => {
                setConfirm(e.target.value);
                setSaved(false);
              }}
              autoComplete="new-password"
              required
            />
          </label>
        </div>

        {error && <div className="form-error">{error}</div>}
        {saved && !error && <p className="muted hint">Password changed.</p>}

        <div className="form-actions">
          <button className="btn btn--primary btn--inline" type="submit" disabled={busy}>
            {busy ? "Saving…" : "Change password"}
          </button>
        </div>
      </form>
    </div>
  );
}
