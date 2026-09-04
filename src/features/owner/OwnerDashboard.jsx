import { Routes, Route, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../../auth";
import Logo from "../../components/Logo";
import LockedScreen from "../../components/LockedScreen";
import ThemeToggle from "../../components/ThemeToggle";
import { IconDashboard, IconPeople, IconClipboard, IconChart, IconBadge, IconGear, IconDownload, IconLogout, IconSync, IconBuilding } from "../../components/NavIcons";
import OwnerHome from "./OwnerHome";
import Attendance from "./Attendance";
import Finances from "./Finances";
import ManageStaff from "./ManageStaff";
import StaffProfile from "./StaffProfile";
import ExpiringSoon from "./ExpiringSoon";
import GymSettings from "./GymSettings";
import MembersList from "./MembersList";
import CrossBranchReport from "./CrossBranchReport";
import MemberProfile from "../MemberProfile";
import DownloadsPage from "../DownloadsPage";

// Every nav entry is a direct link to one page — no dropdowns. ExpiringSoon
// is still routed (reached by clicking through OwnerHome's dashboard cards,
// same drill-down pattern as the admin dashboard) but deliberately left out
// of NAV since it's not a top-level destination. "All branches" (BUILD.md
// §6) is appended conditionally below, only for owners managing more than
// one branch — everyone else's nav is exactly what it's always been.
const NAV = [
  { to: "/owner", end: true, label: "Dashboard", Icon: IconDashboard },
  { to: "/owner/members", label: "Members", Icon: IconPeople },
  { to: "/owner/attendance", label: "Attendance", Icon: IconClipboard },
  { to: "/owner/finances", label: "Finances", Icon: IconChart },
  { to: "/owner/staff", label: "Team", Icon: IconBadge },
  { to: "/owner/downloads", label: "Downloads", Icon: IconDownload },
  { to: "/owner/settings", label: "Settings", Icon: IconGear },
];
const BRANCHES_NAV = { to: "/owner/branches", label: "All branches", Icon: IconBuilding };

// Milestone 3 (BUILD.md §15) — the sync icon-button's title/aria-label.
// Local, not shared: same small-duplication precedent as DeskHome.jsx's
// own local GearIcon.
function syncLabel({ syncStatus, lastSyncedAt, pendingCount }) {
  if (syncStatus === "syncing") return "Syncing…";
  if (syncStatus === "error") return "Sync failed — will retry automatically";
  if (pendingCount > 0) return `${pendingCount} pending change${pendingCount === 1 ? "" : "s"} — tap to sync now`;
  if (lastSyncedAt) return "Synced — tap to sync now";
  return "Tap to sync now";
}

export default function OwnerDashboard() {
  const { account, gym, gymId, branches, setActiveGym, signOut, isLocked, syncStatus, lastSyncedAt, pendingCount, syncNow } = useAuth();
  const navigate = useNavigate();

  // A locked/suspended gym serves no operational data (BUILD.md §11) — the
  // rules refuse it server-side; this is the friendly client-side mirror.
  // In Electron, also true once locally-known data says the subscription
  // is past its grace period (BUILD.md §13's forward-only-clock self-lock)
  // — both cases are folded into isLocked by AuthProvider (src/auth.jsx).
  if (isLocked) return <LockedScreen />;

  const nav = branches.length > 1 ? [...NAV, BRANCHES_NAV] : NAV;

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

        {/* Multi-branch owners only (BUILD.md §6) — a single-branch owner's
            sidebar is byte-for-byte what it's always been. Switching
            navigates back to /owner rather than trying to keep whatever
            per-record route (e.g. a staff/member profile) was open, which
            has no meaning once the branch under it has changed. */}
        {branches.length > 1 && (
          <select
            className="branch-switcher"
            value={gymId ?? ""}
            onChange={(e) => {
              setActiveGym(e.target.value);
              navigate("/owner");
            }}
            aria-label="Switch branch"
          >
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        )}

        <nav className="sidebar__nav">
          {nav.map((n) => (
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
            <Route index element={<OwnerHome />} />
            <Route path="members" element={<MembersList />} />
            <Route path="attendance" element={<Attendance />} />
            <Route path="expiring" element={<ExpiringSoon />} />
            <Route path="finances" element={<Finances />} />
            <Route path="staff" element={<ManageStaff />} />
            <Route path="staff/:staffId" element={<StaffProfile />} />
            <Route path="branches" element={<CrossBranchReport />} />
            <Route path="downloads" element={<DownloadsPage />} />
            <Route path="settings" element={<GymSettings />} />
            <Route path="member/:memberId" element={<MemberProfile />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}
