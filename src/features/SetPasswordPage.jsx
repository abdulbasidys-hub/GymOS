import { useState } from "react";
import { useAuth } from "../auth";
import { changeOwnPassword } from "../data";
import Logo from "../components/Logo";

// Shown once, right after a new owner/receptionist first signs in on the
// temporary password their creator generated (data/users.js). Nobody who
// creates an account chooses its password — this is where the new user
// replaces it with one only they know. Submitting clears
// must_change_password on the account doc; the live account listener in
// auth.jsx picks that up and the app moves on to the normal home route.
export default function SetPasswordPage() {
  const { account, signOut } = useAuth();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError("");
    if (password.length < 6) return setError("Password must be at least 6 characters.");
    if (password !== confirm) return setError("Passwords don't match.");

    setBusy(true);
    try {
      await changeOwnPassword(password);
    } catch (err) {
      console.error(err);
      setError("Couldn't set your password — sign out and back in with your temporary one, then try again.");
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <form className="login__card" onSubmit={submit}>
        <div className="login__logo"><Logo size={69} /></div>
        <p className="login__sub">
          Welcome, {account?.name || "there"} — set your own password to continue.
        </p>

        <label className="field">
          <span>New password</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            required
          />
        </label>
        <label className="field">
          <span>Confirm password</span>
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            required
          />
        </label>

        {error && <div className="login__error">{error}</div>}

        <button className="btn btn--primary" type="submit" disabled={busy}>
          {busy ? "Saving…" : "Set password"}
        </button>
        <button className="btn" type="button" onClick={signOut}>
          Sign out
        </button>
      </form>
    </div>
  );
}
