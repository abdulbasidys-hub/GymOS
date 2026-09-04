import { useEffect, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { listAffiliates, createAffiliate } from "../../data";
import Modal from "../../components/Modal";
import StatusBadge from "../../components/StatusBadge";
import PhoneNumber from "../../components/PhoneNumber";

// Two sub-pages under the "Marketers" nav section: this one (roster, name
// order — registration happens in a popup, not inline) and
// MarketersRevenue.jsx (payouts). Rows are plain/clickable through to
// AffiliateDetailPage — status changes live there, same pattern as
// owner/StaffProfile.jsx moving actions off the list and onto the detail page.
export default function MarketersList() {
  const navigate = useNavigate();
  const [affiliates, setAffiliates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    listAffiliates()
      .then((a) => alive && setAffiliates(a))
      .catch(() => alive && setLoadError("Couldn't load marketers."))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  function addAffiliate(a) {
    setAffiliates((prev) => [...prev, a].sort((x, y) => x.name.localeCompare(y.name)));
  }

  return (
    <>
      <div className="tabs-row">
        <div className="tabs">
          <NavLink to="/admin/marketers" end className={({ isActive }) => `tab ${isActive ? "active" : ""}`}>
            Marketers
          </NavLink>
          <NavLink to="/admin/marketers/revenue" className={({ isActive }) => `tab ${isActive ? "active" : ""}`}>
            Revenue
          </NavLink>
        </div>
        <button className="btn btn--primary btn--inline" onClick={() => setModalOpen(true)}>
          Register a marketer
        </button>
      </div>

      <div className="card">
        <h2>All marketers</h2>
        {loadError && <p className="form-error">{loadError}</p>}
        {loading ? (
          <p className="empty">Loading…</p>
        ) : affiliates.length === 0 ? (
          <p className="empty">No marketers yet.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>#</th>
                <th>Name</th>
                <th>Username</th>
                <th>Phone</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {affiliates.map((a, i) => (
                <tr key={a.id} className="row--expandable" onClick={() => navigate(`/admin/marketers/${a.id}`)}>
                  <td className="muted">{i + 1}</td>
                  <td>{a.name}</td>
                  <td>{a.username}</td>
                  <td><PhoneNumber value={a.phone} /></td>
                  <td>
                    <StatusBadge active={a.active} activeLabel="Active" inactiveLabel="Deactivated" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <RegisterMarketerModal open={modalOpen} onClose={() => setModalOpen(false)} onRegistered={addAffiliate} />
    </>
  );
}

function RegisterMarketerModal({ open, onClose, onRegistered }) {
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [createdAccount, setCreatedAccount] = useState(null);

  function handleClose() {
    onClose();
    // Reset once the close animation-free popup is gone, so it opens fresh
    // next time rather than showing the last submission's temp password.
    setTimeout(() => {
      setName("");
      setUsername("");
      setPhone("");
      setEmail("");
      setError("");
      setCreatedAccount(null);
    }, 0);
  }

  async function submit(e) {
    e.preventDefault();
    setError("");
    const cleanName = name.trim();
    const cleanUsername = username.trim().toLowerCase().replace(/[^a-z0-9-]/g, "");
    const cleanPhone = phone.trim();
    if (!cleanName) return setError("Enter a name.");
    if (!cleanUsername) return setError("Enter a username.");
    if (!cleanPhone) return setError("Enter a phone number.");

    setBusy(true);
    try {
      const acc = await createAffiliate({ username: cleanUsername, name: cleanName, phone: cleanPhone, email: email.trim() });
      onRegistered(acc);
      setCreatedAccount({ username: acc.username, tempPassword: acc.tempPassword });
    } catch (err) {
      console.error(err);
      setError(
        err?.code === "auth/email-already-in-use"
          ? "That username is already taken."
          : "Couldn't create the account."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={handleClose} title="Register a marketer">
      {createdAccount ? (
        <>
          <div className="notice">
            Share this temporary password with <code>{createdAccount.username}</code>:{" "}
            <code>{createdAccount.tempPassword}</code>
            <br />
            They'll be asked to set their own on first login.
          </div>
          <div className="form-actions">
            <button className="btn btn--primary btn--inline" onClick={handleClose}>
              Done
            </button>
          </div>
        </>
      ) : (
        <form onSubmit={submit}>
          <p className="muted hint">
            They earn a commission on payments from gyms attached to them at registration (Gyms → Register a gym).
          </p>
          <label className="field">
            <span>Name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
          </label>
          <label className="field">
            <span>Username</span>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoCapitalize="none"
              spellCheck="false"
              required
            />
          </label>
          <label className="field">
            <span>Phone</span>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} required />
          </label>
          <label className="field">
            <span>Email</span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>

          {error && <div className="form-error">{error}</div>}

          <div className="form-actions">
            <button className="btn btn--primary btn--inline" type="submit" disabled={busy}>
              {busy ? "Registering…" : "Register"}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
