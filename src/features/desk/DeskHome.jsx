import { Routes, Route, NavLink, Link, useLocation } from "react-router-dom";
import { useAuth } from "../../auth";
import Logo from "../../components/Logo";
import LockedScreen from "../../components/LockedScreen";
import ThemeToggle from "../../components/ThemeToggle";
import { IconCheckCircle, IconPeople, IconChart, IconPlus, IconDownload, IconLogout, IconSync, IconGear } from "../../components/NavIcons";
import CheckIn from "./CheckIn";
import DeskMembers from "./DeskMembers";
import DeskFinances from "./DeskFinances";
import RegisterMember from "./RegisterMember";
import MemberProfile from "../MemberProfile";
import DownloadsPage from "../DownloadsPage";
import DeskSettings from "./DeskSettings";

const NAV = [
  { to: "/desk", end: true, label: "Check-in", Icon: IconCheckCircle },
  { to: "/desk/members", label: "Members", Icon: IconPeople },
  { to: "/desk/finances", label: "Finances", Icon: IconChart },
  { to: "/desk/downloads", label: "Downloads", Icon: IconDownload },
  // A nav destination rather than a gear in the header — see
  // DeskSettings.jsx. On a phone the top bar has room for the gym's
  // name or another icon, not both, and the nav bar has the space.
  { to: "/desk/settings", label: "Settings", Icon: IconGear },
];

// Milestone 3 (BUILD.md §15) — the sync icon-button's title/aria-label.
// Local, not shared: the same small-duplication precedent the other
// role shells follow for their own copy of this.
function syncLabel({ syncStatus, lastSyncedAt, pendingCount }) {
  if (syncStatus === "syncing") return "Syncing…";
  if (syncStatus === "error") return "Sync failed — will retry automatically";
  if (pendingCount > 0) return `${pendingCount} pending change${pendingCount === 1 ? "" : "s"} — tap to sync now`;
  if (lastSyncedAt) return "Synced — tap to sync now";
  return "Tap to sync now";
}

export default function DeskHome() {
  const { account, gym, signOut, isLocked, syncStatus, lastSyncedAt, pendingCount, syncNow } = useAuth();
  const { pathname } = useLocation();

  // A locked/suspended gym serves no operational data (BUILD.md §11) — the
  // rules refuse it server-side; this is the friendly client-side mirror.
  // In Electron, also true once locally-known data says the subscription
  // is past its grace period (BUILD.md §13's forward-only-clock self-lock)
  // — both cases are folded into isLocked by AuthProvider (src/auth.jsx).
  if (isLocked) return <LockedScreen />;

  const onRegisterPage = pathname.startsWith("/desk/register");

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="sidebar__brand">
          <Logo size={40} iconOnly />
          <div className="topbar__brand-text">
            <span className="topbar__brand-name">
              Gym<span className="topbar__brand-name-accent">OS</span>
            </span>
            {gym?.name && <span className="topbar__brand-gym">{gym.name}</span>}
          </div>
        </div>

        {/* On a phone this becomes a round floating button above the tab
            bar (see .sidebar__primary in the mobile shell block of
            index.css), where there's no room for the words — hence the
            label in its own span the CSS can hide, and the aria-label
            carrying the same wording so the button is still announced
            once the visible text is gone.

            Hidden on the registration page itself: as a floating button it
            sits over the bottom-right of the page, which on that page is
            the form's own Cancel/Register buttons — a shortcut covering
            the thing it is a shortcut to. */}
        {!onRegisterPage && (
          <div className="sidebar__primary">
            <Link className="btn btn--primary" to="/desk/register" aria-label="Register a new member">
              <IconPlus />
              <span className="sidebar__primary-label">Register a new member</span>
            </Link>
          </div>
        )}

        <nav className="sidebar__nav">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) => `sidebar__link ${isActive ? "active" : ""}`}
            >
              <n.Icon />
              {n.label}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar__footer">
          <div className="sidebar__account">
            <div className="sidebar__identity">
              {account?.name && (
                <span className="avatar-badge" aria-hidden="true">
                  {account.name.trim().charAt(0).toUpperCase()}
                </span>
              )}
              <span className="topbar__user">{account?.name}</span>
            </div>
            <div className="sidebar__actions">
              <ThemeToggle />
              {window.gymOS?.isElectron && (
                <button
                  type="button"
                  className={`btn btn--icon${syncStatus === "syncing" ? " sidebar__sync--spinning" : ""}`}
                  onClick={syncNow}
                  disabled={syncStatus === "syncing"}
                  title={syncLabel({ syncStatus, lastSyncedAt, pendingCount })}
                  aria-label="Sync now"
                >
                  <IconSync />
                </button>
              )}
              <button
                type="button"
                className="btn btn--icon sidebar__signout"
                onClick={signOut}
                title="Sign out"
                aria-label="Sign out"
              >
                <IconLogout />
              </button>
            </div>
          </div>
        </div>
      </aside>

      <div className="shell__main">
        <main className="page">
          <Routes>
            <Route index element={<CheckIn />} />
            <Route path="members" element={<DeskMembers />} />
            <Route path="finances" element={<DeskFinances />} />
            <Route path="downloads" element={<DownloadsPage />} />
            <Route path="settings" element={<DeskSettings />} />
            <Route path="register" element={<RegisterMember />} />
            <Route path="member/:memberId" element={<MemberProfile />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}
