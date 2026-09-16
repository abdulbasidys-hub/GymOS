import { useEffect, useState } from "react";
import { Routes, Route, NavLink } from "react-router-dom";
import { useAuth } from "../../auth";
import { setAffiliateBankDetails } from "../../data";
import Logo from "../../components/Logo";
import ThemeToggle from "../../components/ThemeToggle";
import Modal from "../../components/Modal";
import ChangePasswordForm from "../../components/ChangePasswordForm";
import { IconBuilding, IconChart, IconLogout } from "../../components/NavIcons";
import AffiliateGyms from "./AffiliateGyms";
import AffiliateRevenue from "./AffiliateRevenue";

const NAV = [
  { to: "/affiliate", end: true, label: "Gyms", Icon: IconBuilding },
  { to: "/affiliate/revenue", label: "Revenue", Icon: IconChart },
];

function GearIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
    </svg>
  );
}

// The affiliate marketer's whole app: a topbar (with a Settings popup for
// payout details + password, same shape as the other roles' settings) and
// two sub-pages — Gyms (AffiliateGyms.jsx) and Revenue (AffiliateRevenue.jsx).
// They only ever see their own earnings and their own referred gyms (name/
// status/owner contact only — never a gym's members, same privacy line
// super-admin's own views draw).
export default function AffiliateHome() {
  const { account, signOut } = useAuth();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);

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
            <Route index element={<AffiliateGyms />} />
            <Route path="revenue" element={<AffiliateRevenue />} />
          </Routes>
        </main>
      </div>

      <Modal open={settingsOpen} onClose={() => setSettingsOpen(false)} title="Settings">
        <PayoutDetails affiliateId={account?.id} account={account} />

        <div className="form-actions">
          <button className="btn btn--inline" onClick={() => setPasswordModalOpen(true)}>
            Change password
          </button>
        </div>
      </Modal>

      <Modal open={passwordModalOpen} onClose={() => setPasswordModalOpen(false)} title="Change password">
        <ChangePasswordForm showTitle={false} />
      </Modal>
    </div>
  );
}

// Rarely touched once set — shown as plain text with an Edit button that
// opens its own popup, rather than an always-open form (same pattern as
// super-admin Settings' pricing plans / commission).
function PayoutDetails({ affiliateId, account }) {
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <div className="card">
      <div className="status-block__head">
        <h2>Payout details</h2>
        <button className="btn btn--inline" onClick={() => setModalOpen(true)}>
          Edit
        </button>
      </div>
      <p className="muted hint">Where we send your monthly payout.</p>
      <div className="detail-grid">
        <div>
          <h4>Bank</h4>
          <p>{account?.bank_name || <span className="muted">Not set</span>}</p>
        </div>
        <div>
          <h4>Account number</h4>
          <p>{account?.account_number || <span className="muted">Not set</span>}</p>
        </div>
      </div>

      <EditPayoutModal open={modalOpen} onClose={() => setModalOpen(false)} affiliateId={affiliateId} account={account} />
    </div>
  );
}

function EditPayoutModal({ open, onClose, affiliateId, account }) {
  const [bankName, setBankName] = useState(account?.bank_name || "");
  const [accountNumber, setAccountNumber] = useState(account?.account_number || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setBankName(account?.bank_name || "");
    setAccountNumber(account?.account_number || "");
    setError("");
  }, [open, account]);

  async function submit(e) {
    e.preventDefault();
    setError("");
    if (!bankName.trim()) return setError("Enter your bank name.");
    if (!accountNumber.trim()) return setError("Enter your account number.");

    setBusy(true);
    try {
      await setAffiliateBankDetails(affiliateId, { bankName, accountNumber });
      onClose();
    } catch {
      setError("Couldn't save your bank details.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Payout details">
      <form onSubmit={submit}>
        <label className="field">
          <span>Bank name</span>
          <input value={bankName} onChange={(e) => setBankName(e.target.value)} required autoFocus />
        </label>
        <label className="field">
          <span>Account number</span>
          <input value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} required />
        </label>

        {error && <div className="form-error">{error}</div>}

        <div className="form-actions">
          <button className="btn btn--primary btn--inline" type="submit" disabled={busy}>
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
