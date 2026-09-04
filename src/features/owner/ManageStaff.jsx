import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../auth";
import { createReceptionist, listStaff } from "../../data";
import Modal from "../../components/Modal";
import StatusBadge from "../../components/StatusBadge";
import PhoneNumber from "../../components/PhoneNumber";

export default function ManageStaff() {
  const navigate = useNavigate();
  const { gymId, gym } = useAuth();
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    listStaff(gymId)
      .then((s) => alive && setStaff(s))
      .catch(() => alive && setLoadError("Couldn't load staff."))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [gymId]);

  function addStaff(acc) {
    setStaff((prev) => [...prev, acc].sort((a, b) => a.name.localeCompare(b.name)));
  }

  return (
    <>
      <div className="page-header">
        <h1>Team</h1>
        <p>Receptionists with access to the desk check-in system.</p>
      </div>

      <div className="card">
        <div className="status-block__head">
          <h2>Staff</h2>
          <button className="btn btn--primary btn--inline" onClick={() => setModalOpen(true)}>
            Add a receptionist
          </button>
        </div>
        {loadError && <p className="form-error">{loadError}</p>}
        {loading ? (
          <p className="empty">Loading…</p>
        ) : staff.length === 0 ? (
          <p className="empty">No receptionists yet.</p>
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
              {staff.map((s, i) => (
                <tr key={s.id} className="row--expandable" onClick={() => navigate(`/owner/staff/${s.id}`)}>
                  <td className="muted">{i + 1}</td>
                  <td>{s.name}</td>
                  <td>{s.username}</td>
                  <td><PhoneNumber value={s.phone} /></td>
                  <td>
                    <StatusBadge active={s.active} activeLabel="Active" inactiveLabel="Deactivated" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <AddReceptionistModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        gymId={gymId}
        prefix={gym?.prefix?.toLowerCase() || ""}
        onCreated={addStaff}
      />
    </>
  );
}

function AddReceptionistModal({ open, onClose, gymId, prefix, onCreated }) {
  const [name, setName] = useState("");
  const [usernameSuffix, setUsernameSuffix] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [createdAccount, setCreatedAccount] = useState(null); // { username, tempPassword } — shown once

  function handleClose() {
    onClose();
    setTimeout(() => {
      setName("");
      setUsernameSuffix("");
      setPhone("");
      setAddress("");
      setEmail("");
      setError("");
      setCreatedAccount(null);
    }, 0);
  }

  async function submit(e) {
    e.preventDefault();
    setError("");
    const cleanName = name.trim();
    const cleanSuffix = usernameSuffix.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
    if (!cleanName) return setError("Enter a name.");
    if (!cleanSuffix) return setError("Enter a username.");
    if (!phone.trim()) return setError("Enter a phone number.");

    setBusy(true);
    try {
      const acc = await createReceptionist({
        username: `${prefix}-${cleanSuffix}`,
        name: cleanName,
        gymId,
        phone: phone.trim(),
        address: address.trim(),
        email: email.trim(),
      });
      onCreated(acc);
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
    <Modal open={open} onClose={handleClose} title="Add a receptionist">
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
          <div className="row2">
            <label className="field">
              <span>Name</span>
              <input value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
            </label>
            <label className="field">
              <span>Username</span>
              <div className="username-combo">
                <span className="username-combo__prefix">{prefix}-</span>
                <input
                  value={usernameSuffix}
                  onChange={(e) => setUsernameSuffix(e.target.value)}
                  autoCapitalize="none"
                  spellCheck="false"
                  required
                />
              </div>
            </label>
          </div>
          <label className="field">
            <span>Phone</span>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} required />
          </label>
          <label className="field">
            <span>Address</span>
            <input value={address} onChange={(e) => setAddress(e.target.value)} />
          </label>
          <label className="field">
            <span>Email</span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>

          {error && <div className="form-error">{error}</div>}

          <div className="form-actions">
            <button className="btn btn--primary btn--inline" type="submit" disabled={busy}>
              {busy ? "Creating…" : "Create account"}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
