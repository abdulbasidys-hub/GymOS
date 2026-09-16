import { useAuth } from "../../auth";
import ChangePasswordForm from "../../components/ChangePasswordForm";
import ThemePreference from "../../components/ThemePreference";
import DownloadsPage from "../DownloadsPage";

// The receptionist's own settings, as a page in the nav rather than a
// popup behind a gear icon in the header.
//
// A receptionist administers nothing — the gym, its plans, its staff and
// its custom fields all belong to the owner — so this holds only what is
// genuinely theirs: who they are signed in as, how the app looks, and
// their password. That is also why it was a single-field popup before;
// what changed is where it's reached from, not what's in it. On a phone
// the header has room for the account controls or the gym's name, not
// both, so the least-used of them moves to where there is space.
export default function DeskSettings() {
  const { account, gym } = useAuth();

  return (
    <>
      <div className="page-header">
        <h1>Settings</h1>
        <p>Your account on this device.</p>
      </div>

      <div className="card">
        <h2>Signed in as</h2>
        <div className="detail-grid">
          <div>
            <h4>Name</h4>
            <p>{account?.name || <span className="muted">—</span>}</p>
          </div>
          <div>
            <h4>Username</h4>
            <p>{account?.username || <span className="muted">—</span>}</p>
          </div>
          <div>
            <h4>Gym</h4>
            <p>{gym?.name || <span className="muted">—</span>}</p>
          </div>
        </div>
      </div>

      <div className="card">
        <h2>Appearance</h2>
        <ThemePreference />
      </div>

      {/* Downloads has no tab of its own on a phone (DeskHome.jsx), so it
          lives here. Shown at every width rather than hidden behind a media
          query: on a desktop it's a second, closer route to the same thing,
          which costs nothing and beats a section that vanishes when the
          window is resized. */}
      <DownloadsPage embedded />

      <ChangePasswordForm />
    </>
  );
}
