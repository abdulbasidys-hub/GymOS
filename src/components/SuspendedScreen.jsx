import { useAuth } from "../auth";
import Logo from "./Logo";

// Shown instead of the app when an account has been suspended by its owner
// (users/{uid}.active === false). Deliberately mirrors LockedScreen: the
// friendly client-side face of a wall that is actually enforced server-side
// — firestore.rules' notSuspended() denies a suspended account every read
// and write, so this screen is the explanation, never the enforcement.
//
// Nothing the account recorded is touched by a suspension, and the owner can
// lift it at any time from their Team page, which is what the copy says.
export default function SuspendedScreen() {
  const { account, signOut } = useAuth();
  return (
    <div className="locked">
      <div className="locked__card">
        <div className="splash__logo"><Logo size={53} /></div>
        <h2>Account suspended</h2>
        <p className="muted">
          {account?.name ? `${account.name}, your ` : "Your "}
          access to GymOS has been suspended by the gym owner. Speak to them
          to have it switched back on — nothing you recorded has been lost.
        </p>
        <div className="form-actions">
          <button className="btn" onClick={signOut}>Sign out</button>
        </div>
      </div>
    </div>
  );
}
