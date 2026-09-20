import { useEffect, useState } from "react";
import { useAuth } from "../../auth";
import { setAffiliateBankDetails } from "../../data";
import Modal from "../../components/Modal";
import ThemePreference from "../../components/ThemePreference";
import ChangePasswordForm from "../../components/ChangePasswordForm";

// The marketer's own settings, as a page in the nav rather than a popup
// behind a gear icon — the same move the front desk made, and for the same
// reason: on a phone the header has room for the brand or the controls, not
// both, and the nav bar has the space. It is also where the light/dark
// choice now lives on every role.
export default function AffiliateSettings() {
  const { account } = useAuth();

  return (
    <>
      <div className="page-header">
        <h1>Settings</h1>
        <p>Your account and where your payouts go.</p>
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
        </div>
      </div>

      <PayoutDetails affiliateId={account?.id} account={account} />

      <div className="card">
        <h2>Appearance</h2>
        <p className="muted">Choose how GymOS looks on this device.</p>
        <div className="section-top">
          <ThemePreference />
        </div>
      </div>

      <ChangePasswordForm />
    </>
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
        <div>
          <h4>Account name</h4>
          <p>{account?.account_name || <span className="muted">Not set</span>}</p>
        </div>
      </div>

      <EditPayoutModal open={modalOpen} onClose={() => setModalOpen(false)} affiliateId={affiliateId} account={account} />
    </div>
  );
}

function EditPayoutModal({ open, onClose, affiliateId, account }) {
  const [bankName, setBankName] = useState(account?.bank_name || "");
  const [accountNumber, setAccountNumber] = useState(account?.account_number || "");
  const [accountName, setAccountName] = useState(account?.account_name || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setBankName(account?.bank_name || "");
    setAccountNumber(account?.account_number || "");
    setAccountName(account?.account_name || "");
    setError("");
  }, [open, account]);

  async function submit(e) {
    e.preventDefault();
    setError("");
    if (!bankName.trim()) return setError("Enter your bank name.");
    if (!accountNumber.trim()) return setError("Enter your account number.");
    if (!accountName.trim()) return setError("Enter the account name.");

    setBusy(true);
    try {
      await setAffiliateBankDetails(affiliateId, { bankName, accountNumber, accountName });
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
        <label className="field">
          <span>Account name</span>
          <input value={accountName} onChange={(e) => setAccountName(e.target.value)} required />
          <span className="muted hint">
            Exactly as your bank has it. Transfers are checked against this name, so it may differ from
            your name here — a business account, for instance.
          </span>
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
