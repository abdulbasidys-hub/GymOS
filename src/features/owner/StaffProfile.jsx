import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../../auth";
import { listStaff, listActivityByGym, setUserActive, setUserPhone, setUserEmail } from "../../data";
import StatusBadge from "../../components/StatusBadge";
import PhoneNumber from "../../components/PhoneNumber";
import { formatDateTime, toDate } from "../../lib/helpers";

// One staff member's details + their own slice of the gym's activity log —
// reached by clicking a row on the Team list (ManageStaff.jsx), not from the
// nav bar.
export default function StaffProfile() {
  const { staffId } = useParams();
  const navigate = useNavigate();
  const { gymId } = useAuth();
  const [person, setPerson] = useState(null);
  const [log, setLog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // Contact edit (phone/email) — same fields, same setUserPhone/
  // setUserEmail calls GymDetailPage.jsx's PersonDetailModal already uses
  // for super-admin; this is the same capability for the owner, on their
  // own receptionists, inline on this page rather than a separate modal
  // (this IS the detail page already, no list to pop over).
  const [editingContact, setEditingContact] = useState(false);
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");

  useEffect(() => {
    let alive = true;
    Promise.all([listStaff(gymId), listActivityByGym(gymId)])
      .then(([staff, activity]) => {
        if (!alive) return;
        setPerson(staff.find((s) => s.id === staffId) || null);
        setLog(
          activity
            .filter((a) => a.actor_uid === staffId)
            .sort((a, b) => (toDate(b.at)?.getTime() ?? 0) - (toDate(a.at)?.getTime() ?? 0))
        );
      })
      .catch(() => alive && setError("Couldn't load this staff member."))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [gymId, staffId]);

  async function toggleActive() {
    setBusy(true);
    setError("");
    try {
      await setUserActive(person.id, !person.active);
      setPerson((prev) => ({ ...prev, active: !prev.active }));
    } catch {
      setError("Couldn't update this account.");
    } finally {
      setBusy(false);
    }
  }

  function startEditingContact() {
    setPhone(person.phone || "");
    setEmail(person.email || "");
    setError("");
    setEditingContact(true);
  }

  async function saveContact() {
    setBusy(true);
    setError("");
    try {
      await Promise.all([setUserPhone(person.id, phone.trim()), setUserEmail(person.id, email.trim())]);
      setPerson((prev) => ({ ...prev, phone: phone.trim(), email: email.trim() }));
      setEditingContact(false);
    } catch {
      setError("Couldn't save these changes.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <p className="empty">Loading…</p>;
  if (error && !person) return <p className="form-error">{error}</p>;
  if (!person) return <p className="empty">Staff member not found.</p>;

  return (
    <div>
      <button type="button" className="back-link" onClick={() => navigate(-1)}>&larr; Back</button>

      <div className="card">
        <div className="status-block__head">
          <h2>{person.name}</h2>
          <StatusBadge active={person.active} activeLabel="Active" inactiveLabel="Deactivated" />
        </div>
        <div className="detail-grid">
          <div>
            <h4>Full name</h4>
            <p>{person.name}</p>
          </div>
          <div>
            <h4>Username</h4>
            <p>{person.username}</p>
          </div>
          <div>
            <h4>Phone</h4>
            {editingContact ? (
              <input value={phone} onChange={(e) => setPhone(e.target.value)} />
            ) : (
              <p><PhoneNumber value={person.phone} /></p>
            )}
          </div>
          <div>
            <h4>Address</h4>
            <p>{person.address || <span className="muted">—</span>}</p>
          </div>
          <div>
            <h4>Email</h4>
            {editingContact ? (
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            ) : (
              <p>{person.email || <span className="muted">—</span>}</p>
            )}
          </div>
        </div>

        {error && <div className="form-error">{error}</div>}

        <div className="form-actions">
          {editingContact ? (
            <>
              <button className="btn btn--primary btn--inline" onClick={saveContact} disabled={busy}>
                {busy ? "Saving…" : "Save contact info"}
              </button>
              <button className="btn btn--inline" onClick={() => setEditingContact(false)} disabled={busy}>
                Cancel
              </button>
            </>
          ) : (
            <button className="btn btn--inline" onClick={startEditingContact} disabled={busy}>
              Edit contact info
            </button>
          )}
          <button className="btn btn--inline" onClick={toggleActive} disabled={busy}>
            {busy ? "Working…" : person.active ? "Deactivate" : "Reactivate"}
          </button>
        </div>
      </div>

      <div className="card">
        <h2>Activity</h2>
        {log.length === 0 ? (
          <p className="empty">Nothing logged yet.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>#</th>
                <th>Action</th>
                <th>Target</th>
                <th>When</th>
              </tr>
            </thead>
            <tbody>
              {log.map((entry, i) => (
                <tr key={entry.id}>
                  <td className="muted">{i + 1}</td>
                  <td>{entry.action}</td>
                  <td>{entry.target}</td>
                  <td>{formatDateTime(entry.at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
