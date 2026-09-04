import { useAuth } from "../auth";
import Logo from "./Logo";

// Shown instead of the app when a gym is suspended or instant-locked.
// Records are never deleted — reactivating from super-admin restores
// everything immediately (BUILD.md §11).
export default function LockedScreen() {
  const { signOut } = useAuth();
  return (
    <div className="locked">
      <div className="locked__card">
        <div className="splash__logo"><Logo size={53} /></div>
        <h2>Subscription expired</h2>
        <p className="muted">
          This gym's access is currently locked. Contact your provider to
          reactivate — nothing has been lost, and everything returns the
          moment it's unlocked.
        </p>
        <div className="form-actions">
          <button className="btn" onClick={signOut}>Sign out</button>
        </div>
      </div>
    </div>
  );
}
