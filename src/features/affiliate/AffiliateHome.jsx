import { Routes, Route, NavLink } from "react-router-dom";
import { useAuth } from "../../auth";
import Logo from "../../components/Logo";
import ThemeToggle from "../../components/ThemeToggle";
import { IconBuilding, IconChart, IconGear, IconDownload, IconLogout } from "../../components/NavIcons";
import AffiliateGyms from "./AffiliateGyms";
import AffiliateRevenue from "./AffiliateRevenue";
import AffiliateSettings from "./AffiliateSettings";
import DownloadsPage from "../DownloadsPage";

// `tabOrder` places each tab on the phone bar independently of this list's
// order, which the desktop sidebar follows. Gyms sits in the MIDDLE — it's
// the page the portal opens on — with Settings left and Revenue right.
//
// Downloads is a real tab rather than going behind the burger (as it does in
// the owner's longer nav): four still fits the bar comfortably, and a
// NavMore sheet holding exactly one link is more tapping to reach the same
// place, not less.
const NAV = [
  { to: "/affiliate", end: true, label: "Gyms", Icon: IconBuilding, tab: true, tabOrder: 2 },
  { to: "/affiliate/revenue", label: "Revenue", Icon: IconChart, tab: true, tabOrder: 3 },
  { to: "/affiliate/downloads", label: "Downloads", Icon: IconDownload, tab: true, tabOrder: 4 },
  { to: "/affiliate/settings", label: "Settings", Icon: IconGear, tab: true, tabOrder: 1 },
];

// The affiliate marketer's whole app: a sidebar and four sub-pages — Gyms
// (AffiliateGyms.jsx), Revenue (AffiliateRevenue.jsx), Downloads (the shared
// DownloadsPage.jsx, giving them the installer and both role guides so they
// can demo the product and train a new gym) and Settings
// (AffiliateSettings.jsx, which holds payout details, appearance and their
// password). They only ever see their own earnings and their own referred
// gyms (name/status/owner contact only — never a gym's members, the same
// privacy line super-admin's own views draw).
export default function AffiliateHome() {
  const { account, signOut } = useAuth();

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="sidebar__brand">
          <Logo size={40} iconOnly />
          <div className="topbar__brand-text">
            <span className="topbar__brand-name">
              Gym<span className="topbar__brand-name-accent">OS</span>
            </span>
          </div>
        </div>

        <nav className="sidebar__nav">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) =>
                `sidebar__link ${isActive ? "active" : ""} ${
                  n.tab ? `sidebar__link--tab-${n.tabOrder}` : "sidebar__link--more"
                }`
              }
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
            <Route index element={<AffiliateGyms />} />
            <Route path="revenue" element={<AffiliateRevenue />} />
            <Route path="downloads" element={<DownloadsPage />} />
            <Route path="settings" element={<AffiliateSettings />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}
