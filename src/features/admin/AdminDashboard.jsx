import { Routes, Route, NavLink } from "react-router-dom";
import { useAuth } from "../../auth";
import Logo from "../../components/Logo";
import ThemeToggle from "../../components/ThemeToggle";
import { IconDashboard, IconBuilding, IconCard, IconChart, IconMegaphone, IconSync, IconGear, IconLogout } from "../../components/NavIcons";
import Dashboard from "./Dashboard";
import GymsList from "./GymsList";
import GymDetailPage from "./GymDetailPage";
import OwnerDetailPage from "./OwnerDetailPage";
import Subscriptions from "./Subscriptions";
import Revenue from "./Revenue";
import SyncMonitor from "./SyncMonitor";
import Settings from "./Settings";
import AttentionPage from "./AttentionPage";
import MarketersList from "./MarketersList";
import MarketersRevenue from "./MarketersRevenue";
import AffiliateDetailPage from "./AffiliateDetailPage";

const NAV = [
  { to: "/admin", end: true, label: "Dashboard", Icon: IconDashboard },
  { to: "/admin/gyms", label: "Gyms", Icon: IconBuilding },
  { to: "/admin/subscriptions", label: "Subscriptions", Icon: IconCard },
  { to: "/admin/revenue", label: "Revenue", Icon: IconChart },
  { to: "/admin/marketers", label: "Marketers", Icon: IconMegaphone },
  { to: "/admin/sync", label: "Sync Monitor", Icon: IconSync },
  { to: "/admin/settings", label: "Settings", Icon: IconGear },
];

export default function AdminDashboard() {
  const { account, signOut } = useAuth();
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="sidebar__brand">
          <Logo size={35} iconOnly />
          <span className="topbar__brand-name">
            Gym<span className="topbar__brand-name-accent">OS</span>
          </span>
        </div>

        <nav className="sidebar__nav">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => `sidebar__link ${isActive ? "active" : ""}`}>
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
            <Route index element={<Dashboard />} />
            <Route path="gyms" element={<GymsList />} />
            <Route path="gyms/:gymId" element={<GymDetailPage />} />
            {/* Drill-down only (Manage billing link, Subscriptions rows) — not in sidebar nav. */}
            <Route path="owners/:ownerId" element={<OwnerDetailPage />} />
            <Route path="subscriptions" element={<Subscriptions />} />
            <Route path="revenue" element={<Revenue />} />
            <Route path="marketers" element={<MarketersList />} />
            <Route path="marketers/revenue" element={<MarketersRevenue />} />
            <Route path="marketers/:affiliateId" element={<AffiliateDetailPage />} />
            <Route path="sync" element={<SyncMonitor />} />
            <Route path="settings" element={<Settings />} />
            {/* Drill-down reached only by clicking through the Dashboard's
                capped preview table — not in the sidebar nav. */}
            <Route path="attention" element={<AttentionPage />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}
