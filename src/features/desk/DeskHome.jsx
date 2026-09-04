import { useState } from "react";
import { Routes, Route, NavLink, Link } from "react-router-dom";
import { useAuth } from "../../auth";
import Logo from "../../components/Logo";
import LockedScreen from "../../components/LockedScreen";
import Modal from "../../components/Modal";
import ChangePasswordForm from "../../components/ChangePasswordForm";
import ThemeToggle from "../../components/ThemeToggle";
import { IconCheckCircle, IconPeople, IconChart, IconPlus, IconDownload, IconLogout, IconSync } from "../../components/NavIcons";
import CheckIn from "./CheckIn";
import DeskMembers from "./DeskMembers";
import DeskFinances from "./DeskFinances";
import RegisterMember from "./RegisterMember";
import MemberProfile from "../MemberProfile";
import DownloadsPage from "../DownloadsPage";

function GearIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
    </svg>
  );
}

const NAV = [
  { to: "/desk", end: true, label: "Check-in", Icon: IconCheckCircle },
  { to: "/desk/members", label: "Members", Icon: IconPeople },
  { to: "/desk/finances", label: "Finances", Icon: IconChart },
  { to: "/desk/downloads", label: "Downloads", Icon: IconDownload },
];

// Milestone 3 (BUILD.md §15) — the sync icon-button's title/aria-label.
// Local, not shared: same small-duplication precedent as GearIcon above.
function syncLabel({ syncStatus, lastSyncedAt, pendingCount }) {
  if (syncStatus === "syncing") return "Syncing…";
  if (syncStatus === "error") return "Sync failed — will retry automatically";
  if (pendingCount > 0) return `${pendingCount} pending change${pendingCount === 1 ? "" : "s"} — tap to sync now`;
  if (lastSyncedAt) return "Synced — tap to sync now";
  return "Tap to sync now";
}

export default function DeskHome() {
  const { account, gym, signOut, isLocked, syncStatus, lastSyncedAt, pendingCount, syncNow } = useAuth();
  const [settingsOpen, setSettingsOpen] = useState(false);

  // A locked/suspended gym serves no operational data (BUILD.md §11) — the
  // rules refuse it server-side; this is the friendly client-side mirror.
  // In Electron, also true once locally-known data says the subscription
  // is past its grace period (BUILD.md §13's forward-only-clock self-lock)
  // — both cases are folded into isLocked by AuthProvider (src/auth.jsx).
  if (isLocked) return <LockedScreen />;

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

        <div className="sidebar__primary">
          <Link className="btn btn--primary" to="/desk/register">
            <IconPlus />
            Register a new member
          </Link>
        </div>

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
                className="btn btn--icon"
                onClick={() => setSettingsOpen(true)}
                title="Settings"
                aria-label="Settings"
              >
                <GearIcon />
              </button>
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
            <Route path="register" element={<RegisterMember />} />
            <Route path="member/:memberId" element={<MemberProfile />} />
          </Routes>
        </main>
      </div>

      <Modal open={settingsOpen} onClose={() => setSettingsOpen(false)} title="Settings">
        <ChangePasswordForm />
      </Modal>
    </div>
  );
}
