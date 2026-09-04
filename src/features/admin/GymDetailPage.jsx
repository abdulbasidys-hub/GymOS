import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../auth";
import {
  getGym,
  updateGymName,
  getOwnerForGym,
  listStaff,
  listMembers,
  listAttendanceByGym,
  listPlatformPlans,
  listActivityByGym,
  createOwner,
  setUserActive,
  setUserPhone,
  setUserEmail,
  suspendGym,
  reactivateGym,
  logAdminActivity,
  deleteGymAndAllData,
} from "../../data";
import Modal from "../../components/Modal";
import StatusBadge from "../../components/StatusBadge";
import TrendChart from "../../components/TrendChart";
import PhoneNumber from "../../components/PhoneNumber";
import ExpandableActivity from "../../components/ExpandableActivity";
import { licenseStatus, daysRemaining } from "../../logic/license";
import { dailyBuckets } from "../../logic/timeseries";
import { formatDate, formatDateTime, toDate, capitalize } from "../../lib/helpers";

const TREND_DAYS = 14;

// The owner and each receptionist open the same popup — name, username,
// status, editable phone/email, and deactivate/reactivate. Reached by
// tapping their row (GymDetailPage's Owner/Receptionists cards no longer
// carry any inline buttons themselves). Email is captured for a future
// notification feature — nothing reads it yet.
function PersonDetailModal({ person, onClose, onSaveContact, onToggleActive }) {
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setPhone(person?.phone || "");
    setEmail(person?.email || "");
    setError("");
  }, [person]);

  async function saveContact() {
    setBusy(true);
    setError("");
    try {
      await Promise.all([setUserPhone(person.id, phone.trim()), setUserEmail(person.id, email.trim())]);
      onSaveContact(person.id, { phone: phone.trim(), email: email.trim() });
    } catch {
      setError("Couldn't save these changes.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive() {
    setBusy(true);
    setError("");
    try {
      await setUserActive(person.id, !person.active);
      onToggleActive(person.id, !person.active);
    } catch {
      setError("Couldn't update this account.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={!!person} onClose={onClose} title={person?.name || ""}>
      {person && (
        <>
          <div className="detail-grid">
            <div>
              <h4>Username</h4>
              <p>{person.username}</p>
            </div>
            <div>
              <h4>Status</h4>
              <p>
                <StatusBadge active={person.active} activeLabel="Active" inactiveLabel="Deactivated" />
              </p>
            </div>
          </div>

          <label className="field">
            <span>Phone</span>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} />
          </label>
          <label className="field">
            <span>Email</span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>

          {error && <div className="form-error">{error}</div>}

          <div className="form-actions form-actions--row">
            <button className="btn btn--inline btn--primary" onClick={saveContact} disabled={busy}>
              {busy ? "Saving…" : "Save"}
            </button>
            <button className="btn btn--inline" onClick={toggleActive} disabled={busy}>
              {person.active ? "Deactivate" : "Reactivate"}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}

// The gym name is the one editable, non-permanent identity field (the
// prefix is locked forever — member numbers depend on it, see NewGym.jsx).
function GymHeader({ gym, onSaved }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(gym.name);
  const [busy, setBusy] = useState(false);

  async function save() {
    const clean = value.trim();
    if (!clean) return;
    setBusy(true);
    try {
      await updateGymName(gym.id, clean);
      onSaved(clean);
      setEditing(false);
    } catch {
      // Leave the field open on failure so the edit isn't lost.
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="member-id">
      <span className="member-id__no">{gym.prefix}</span>
      {editing ? (
        <>
          <input value={value} onChange={(e) => setValue(e.target.value)} autoFocus />
          <button className="btn btn--inline btn--primary" onClick={save} disabled={busy}>
            {busy ? "Saving…" : "Save"}
          </button>
          <button
            className="btn btn--inline"
            onClick={() => {
              setValue(gym.name);
              setEditing(false);
            }}
            disabled={busy}
          >
            Cancel
          </button>
        </>
      ) : (
        <>
          <h1>{gym.name}</h1>
          <button className="btn btn--inline" onClick={() => setEditing(true)}>
            Edit
          </button>
        </>
      )}
    </div>
  );
}

export default function GymDetailPage() {
  const { gymId } = useParams();
  const navigate = useNavigate();
  const { account } = useAuth();

  const [gym, setGym] = useState(null);
  const [owner, setOwner] = useState(null);
  const [staff, setStaff] = useState([]);
  const [members, setMembers] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [plans, setPlans] = useState([]);
  const [activity, setActivity] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [selectedPersonId, setSelectedPersonId] = useState(null);
  const [ownerModalOpen, setOwnerModalOpen] = useState(false);

  const [ownerName, setOwnerName] = useState("");
  const [ownerUsername, setOwnerUsername] = useState("");
  const [ownerPhone, setOwnerPhone] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [createdOwner, setCreatedOwner] = useState(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    Promise.all([
      getGym(gymId),
      getOwnerForGym(gymId),
      listStaff(gymId),
      listMembers(gymId),
      listAttendanceByGym(gymId),
      listPlatformPlans(),
      listActivityByGym(gymId),
    ])
      .then(([g, o, s, m, a, pl, act]) => {
        if (!alive) return;
        if (!g) {
          setLoadError("Gym not found.");
          return;
        }
        setGym(g);
        setOwner(o);
        setStaff(s);
        setMembers(m);
        setAttendance(a);
        setPlans(pl);
        setActivity(act.sort((x, y) => (toDate(y.at)?.getTime() ?? 0) - (toDate(x.at)?.getTime() ?? 0)));
        setOwnerUsername(`${g.prefix.toLowerCase()}-owner`);
      })
      .catch((err) => {
        console.error(err);
        if (alive) setLoadError("Couldn't load this gym.");
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [gymId]);

  if (loading) return <p className="empty">Loading…</p>;
  if (loadError) return <p className="form-error">{loadError}</p>;

  const status = licenseStatus(gym);
  const remaining = daysRemaining(gym.subscription?.expiry_date);
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayAttendance = attendance.filter(
    (a) => (toDate(a.recorded_at)?.getTime() ?? 0) >= todayStart.getTime()
  ).length;
  const activeMembers = members.filter((m) => m.active !== false).length;
  // Informational only (Settings.jsx §11) — nothing here blocks a gym from
  // exceeding its plan's caps, this just surfaces it to the super admin.
  const assignedPlan = plans.find((p) => p.id === gym.subscription?.plan_id);
  const attendanceTrend = dailyBuckets(attendance, TREND_DAYS, (a) => a.recorded_at, () => 1);

  const selectedPerson =
    owner?.id === selectedPersonId ? owner : staff.find((s) => s.id === selectedPersonId) || null;

  function closeOwnerModal() {
    setOwnerModalOpen(false);
    setTimeout(() => {
      setOwnerName("");
      setOwnerUsername(`${gym.prefix.toLowerCase()}-owner`);
      setOwnerPhone("");
      setOwnerEmail("");
      setError("");
      setCreatedOwner(null);
    }, 0);
  }

  async function submitOwner(e) {
    e.preventDefault();
    setError("");
    if (!ownerName.trim() || !ownerUsername.trim()) {
      setError("Fill in a name and username.");
      return;
    }
    if (!ownerPhone.trim()) {
      setError("Enter the owner's phone number.");
      return;
    }
    setBusy(true);
    try {
      const acc = await createOwner({
        username: ownerUsername.trim(),
        name: ownerName.trim(),
        gymId: gym.id,
        phone: ownerPhone.trim(),
        email: ownerEmail.trim(),
      });
      setOwner(acc);
      setCreatedOwner({ username: acc.username, tempPassword: acc.tempPassword });
    } catch (err) {
      console.error(err);
      setError(
        err?.code === "auth/email-already-in-use"
          ? "That username is already taken."
          : "Couldn't create the owner."
      );
    } finally {
      setBusy(false);
    }
  }

  async function toggleGymStatus() {
    setBusy(true);
    setError("");
    try {
      if (gym.status === "active") {
        await suspendGym(gym.id);
        await logAdminActivity({
          gymId: gym.id,
          gymName: gym.name,
          activity: "Gym suspended",
          status: "locked",
          performedBy: account?.name,
        });
        setGym((g) => ({ ...g, status: "suspended" }));
      } else {
        await reactivateGym(gym.id);
        await logAdminActivity({
          gymId: gym.id,
          gymName: gym.name,
          activity: "Gym reactivated",
          status: "active",
          performedBy: account?.name,
        });
        setGym((g) => ({ ...g, status: "active" }));
      }
    } catch {
      setError("Couldn't update the gym's status.");
    } finally {
      setBusy(false);
    }
  }

  function handlePersonContactSaved(personId, patch) {
    if (owner?.id === personId) setOwner((o) => ({ ...o, ...patch }));
    else setStaff((prev) => prev.map((s) => (s.id === personId ? { ...s, ...patch } : s)));
  }

  function handlePersonActiveToggled(personId, active) {
    if (owner?.id === personId) setOwner((o) => ({ ...o, active }));
    else setStaff((prev) => prev.map((s) => (s.id === personId ? { ...s, active } : s)));
  }

  // TESTING ONLY — see data/dangerZone.js.
  async function handleDeleteGym() {
    const ok = window.confirm(
      `Permanently delete "${gym.name}" and ALL its data — members, payments, attendance, plans, staff accounts? This cannot be undone.`
    );
    if (!ok) return;
    setBusy(true);
    setError("");
    try {
      await deleteGymAndAllData(gym.id);
      navigate("/admin/gyms", { replace: true });
    } catch {
      setError("Couldn't delete this gym.");
      setBusy(false);
    }
  }

  return (
    <>
      <Link to="/admin/gyms" className="back-link">
        ← All gyms
      </Link>

      <GymHeader gym={gym} onSaved={(name) => setGym((g) => ({ ...g, name }))} />
      <p className="muted page-lead">Using GymOS since {formatDate(gym.created_at)}</p>
      {gym.address && <p className="muted">{gym.address}</p>}
      {gym.country_name && (
        <p className="muted">
          {gym.country_name} · prices at this gym show in {gym.currency_code}
        </p>
      )}
      {gym.affiliate_name && <p className="muted">Referred by {gym.affiliate_name}</p>}

      {error && <div className="form-error">{error}</div>}

      <div className="stat-grid section-top">
        <div className="stat-card">
          <div className="stat-card__label">Today's attendance</div>
          <div className="stat-card__value">{todayAttendance}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card__label">Members</div>
          <div className="stat-card__value">
            {activeMembers}
            {activeMembers !== members.length && <span className="muted"> / {members.length}</span>}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-card__label">Staff</div>
          <div className="stat-card__value">{staff.length}</div>
        </div>
      </div>

      <div className="status-blocks">
        <div className="status-block">
          <div className="status-block__head">
            <h3>Gym status</h3>
            <StatusBadge active={gym.status === "active"} activeLabel="Active" inactiveLabel="Suspended" />
          </div>
          <p className="status-block__meta">Suspending blocks this gym's access to GymOS entirely.</p>
          <div className="form-actions">
            <button className="btn btn--inline" onClick={toggleGymStatus} disabled={busy}>
              {gym.status === "active" ? "Suspend gym" : "Reactivate gym"}
            </button>
          </div>
        </div>

        <div className="status-block">
          <div className="status-block__head">
            <h3>Subscription</h3>
            <strong className={`status-text status-text--${status}`}>{capitalize(status)}</strong>
          </div>
          <p className="status-block__meta">
            {gym.subscription?.plan_name ? `${gym.subscription.plan_name} plan · ` : ""}
            {gym.subscription?.expiry_date ? `Expires ${formatDate(gym.subscription.expiry_date)}` : "No expiry set."}
            {remaining != null && (
              <>
                {" · "}
                {remaining >= 0 ? `${remaining}d remaining` : `${Math.abs(remaining)}d past expiry`}
              </>
            )}
          </p>
          {assignedPlan && (assignedPlan.max_members != null || assignedPlan.max_receptionists != null || assignedPlan.max_branches != null) && (
            <p className="status-block__meta">
              {assignedPlan.max_branches != null && (
                <>
                  Branches {owner?.gym_ids?.length ?? (owner ? 1 : 0)} / {assignedPlan.max_branches}
                  {(owner?.gym_ids?.length ?? 0) > assignedPlan.max_branches && <span className="pill pill--caution"> over limit</span>}
                </>
              )}
              {assignedPlan.max_branches != null && assignedPlan.max_members != null && " · "}
              {assignedPlan.max_members != null && (
                <>
                  Members {activeMembers} / {assignedPlan.max_members}
                  {activeMembers > assignedPlan.max_members && <span className="pill pill--caution"> over limit</span>}
                </>
              )}
              {(assignedPlan.max_branches != null || assignedPlan.max_members != null) && assignedPlan.max_receptionists != null && " · "}
              {assignedPlan.max_receptionists != null && (
                <>
                  Receptionists {staff.length} / {assignedPlan.max_receptionists}
                  {staff.length > assignedPlan.max_receptionists && <span className="pill pill--caution"> over limit</span>}
                </>
              )}
            </p>
          )}
          <div className="form-actions">
            {owner ? (
              <Link to={`/admin/owners/${owner.id}`} className="btn btn--inline">
                Manage billing (all branches) →
              </Link>
            ) : (
              <span className="muted hint">Create an owner first to manage billing.</span>
            )}
          </div>
        </div>
      </div>

      <div className="trend-grid">
        <TrendChart data={attendanceTrend} valueLabel="Check-ins" formatValue={(v) => String(v)} color="var(--text-secondary)" />
      </div>

      <div className="two-col-cards">
        <div className="card">
          <h2>Owner</h2>
          {owner ? (
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Phone</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                <tr className="row--expandable" onClick={() => setSelectedPersonId(owner.id)}>
                  <td>
                    {owner.name}
                    <br />
                    <span className="muted">{owner.username}</span>
                  </td>
                  <td><PhoneNumber value={owner.phone} fallback="No phone" /></td>
                  <td>
                    <StatusBadge active={owner.active} activeLabel="Active" inactiveLabel="Deactivated" />
                  </td>
                </tr>
              </tbody>
            </table>
          ) : (
            <>
              <p className="empty">No owner yet.</p>
              <div className="form-actions">
                <button className="btn btn--inline btn--primary" onClick={() => setOwnerModalOpen(true)}>
                  Create owner
                </button>
              </div>
            </>
          )}
        </div>

        <div className="card">
          <h2>Receptionists</h2>
          {staff.length === 0 ? (
            <p className="empty">No receptionists yet — added by the gym's owner.</p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Name</th>
                  <th>Phone</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {staff.map((s, i) => (
                  <tr key={s.id} className="row--expandable" onClick={() => setSelectedPersonId(s.id)}>
                    <td className="muted">{i + 1}</td>
                    <td>{s.name}</td>
                    <td><PhoneNumber value={s.phone} fallback="No phone" /></td>
                    <td>
                      <StatusBadge active={s.active} activeLabel="Active" inactiveLabel="Deactivated" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="card">
        <h2>Recent activity</h2>
        <p className="muted hint">
          What this gym's staff have been doing — registrations, payments, check-ins. Individual members aren't
          named here; that's the gym's own business.
        </p>
        <ExpandableActivity
          entries={activity}
          dateOf={(entry) => toDate(entry.at)}
          columns={["#", "When", "Action"]}
          renderRow={(entry, i) => (
            <tr key={entry.id}>
              <td className="muted">{i + 1}</td>
              <td className="muted">{formatDateTime(entry.at)}</td>
              <td>{entry.action}</td>
            </tr>
          )}
        />
      </div>

      <div className="card">
        <h2>Danger zone — testing only</h2>
        <p className="muted hint">
          Permanently deletes this gym and everything tied to it — members, payments, attendance, plans,
          staff accounts. For cleaning up test gyms before launch, not for real customers. Cannot be undone.
        </p>
        <div className="form-actions">
          <button className="btn btn--inline" onClick={handleDeleteGym} disabled={busy}>
            {busy ? "Deleting…" : "Delete gym & all its data"}
          </button>
        </div>
      </div>

      <PersonDetailModal
        person={selectedPerson}
        onClose={() => setSelectedPersonId(null)}
        onSaveContact={handlePersonContactSaved}
        onToggleActive={handlePersonActiveToggled}
      />

      <Modal open={ownerModalOpen} onClose={closeOwnerModal} title="Create owner">
        {createdOwner ? (
          <>
            <div className="notice">
              Share this temporary password with <code>{createdOwner.username}</code>:{" "}
              <code>{createdOwner.tempPassword}</code>
              <br />
              They'll be asked to set their own on first login.
            </div>
            <div className="form-actions">
              <button className="btn btn--primary btn--inline" onClick={closeOwnerModal}>
                Done
              </button>
            </div>
          </>
        ) : (
          <form onSubmit={submitOwner}>
            <label className="field">
              <span>Name</span>
              <input value={ownerName} onChange={(e) => setOwnerName(e.target.value)} required autoFocus />
            </label>
            <label className="field">
              <span>Username</span>
              <input
                value={ownerUsername}
                onChange={(e) => setOwnerUsername(e.target.value)}
                autoCapitalize="none"
                spellCheck="false"
                required
              />
            </label>
            <label className="field">
              <span>Phone</span>
              <input value={ownerPhone} onChange={(e) => setOwnerPhone(e.target.value)} required />
            </label>
            <label className="field">
              <span>Email</span>
              <input type="email" value={ownerEmail} onChange={(e) => setOwnerEmail(e.target.value)} />
            </label>

            {error && <div className="form-error">{error}</div>}

            <div className="form-actions">
              <button className="btn btn--inline btn--primary" type="submit" disabled={busy}>
                {busy ? "Creating…" : "Create owner"}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}
