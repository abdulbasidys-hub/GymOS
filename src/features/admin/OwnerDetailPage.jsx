import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { getUserRecord, getGym, listPlatformPaymentsByOwner, listPlatformPlans } from "../../data";
import StatusBadge from "../../components/StatusBadge";
import SubscriptionModal from "./SubscriptionModal";
import { licenseStatus, daysRemaining } from "../../logic/license";
import { naira, formatDate, capitalize, toDate } from "../../lib/helpers";

// One owner's pooled subscription (BUILD.md §6) — the canonical place
// billing is managed now that one subscription covers every branch they
// manage, not one gym. Reached from GymDetailPage's "Manage billing" link
// or Subscriptions.jsx's owner rows, never from the sidebar nav directly.
export default function OwnerDetailPage() {
  const { ownerId } = useParams();
  const navigate = useNavigate();
  const [owner, setOwner] = useState(null);
  const [branches, setBranches] = useState([]);
  const [payments, setPayments] = useState([]);
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [subscriptionModalOpen, setSubscriptionModalOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    getUserRecord(ownerId)
      .then(async (o) => {
        if (!alive) return;
        if (!o) {
          setLoadError("Owner not found.");
          return;
        }
        setOwner(o);
        const gymIds = o.gym_ids?.length ? o.gym_ids : o.gym_id ? [o.gym_id] : [];
        const [gyms, pay, pl] = await Promise.all([
          Promise.all(gymIds.map((id) => getGym(id))),
          listPlatformPaymentsByOwner(ownerId),
          listPlatformPlans(),
        ]);
        if (!alive) return;
        setBranches(gyms.filter(Boolean));
        setPayments(pay.sort((a, b) => (toDate(b.paid_at)?.getTime() ?? 0) - (toDate(a.paid_at)?.getTime() ?? 0)));
        setPlans(pl);
      })
      .catch(() => alive && setLoadError("Couldn't load this owner."))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [ownerId]);

  if (loading) return <p className="empty">Loading…</p>;
  if (loadError) return <p className="form-error">{loadError}</p>;
  if (!owner) return <p className="empty">Owner not found.</p>;

  const status = licenseStatus({ status: "active", subscription: owner.subscription });
  const remaining = daysRemaining(owner.subscription?.expiry_date);
  const primaryGym = branches.find((b) => b.id === owner.gym_id) ?? branches[0] ?? null;
  const assignedPlan = plans.find((p) => p.id === owner.subscription?.plan_id);

  return (
    <div>
      <Link to={primaryGym ? `/admin/gyms/${primaryGym.id}` : "/admin/gyms"} className="back-link">
        ← Back to gym
      </Link>

      <div className="status-block__head">
        <h1>{owner.name}&rsquo;s account</h1>
        <StatusBadge active={owner.active} activeLabel="Active" inactiveLabel="Deactivated" />
      </div>
      <p className="muted page-lead">
        {branches.length} branch{branches.length === 1 ? "" : "es"} · one pooled subscription covers all of them.
      </p>

      <div className="card section-top">
        <div className="status-block__head">
          <h2>Billing</h2>
          <strong className={`status-text status-text--${status}`}>{capitalize(status)}</strong>
        </div>
        <div className="detail-grid">
          <div>
            <h4>Plan</h4>
            <p>{owner.subscription?.plan_name || <span className="muted">—</span>}</p>
          </div>
          <div>
            <h4>Expires</h4>
            <p className="muted">
              {owner.subscription?.expiry_date ? formatDate(owner.subscription.expiry_date) : "Not set"}
              {remaining != null &&
                ` · ${remaining >= 0 ? `${remaining}d left` : `${Math.abs(remaining)}d overdue`}`}
            </p>
          </div>
          {assignedPlan?.max_branches != null && (
            <div>
              <h4>Branches</h4>
              <p className="muted">
                {branches.length} / {assignedPlan.max_branches}
                {branches.length > assignedPlan.max_branches && <span className="pill pill--caution"> over limit</span>}
              </p>
            </div>
          )}
        </div>
        <div className="form-actions">
          <button className="btn btn--inline btn--primary" onClick={() => setSubscriptionModalOpen(true)}>
            Manage billing →
          </button>
        </div>
      </div>

      <div className="card">
        <h2>Branches</h2>
        {branches.length === 0 ? (
          <p className="empty">No branches yet.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>#</th>
                <th>Name</th>
                <th>Prefix</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {branches.map((b, i) => (
                <tr key={b.id} className="row--expandable" onClick={() => navigate(`/admin/gyms/${b.id}`)}>
                  <td className="muted">{i + 1}</td>
                  <td>
                    {b.name}
                    {b.id === owner.gym_id && <span className="muted"> · primary</span>}
                  </td>
                  <td className="muted">{b.prefix}</td>
                  <td>
                    <StatusBadge active={b.status === "active"} activeLabel="Active" inactiveLabel="Suspended" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <h2>Payment history</h2>
        <p className="muted hint">What this account has paid the platform for GymOS, across every branch.</p>
        {payments.length === 0 ? (
          <p className="empty">No payments logged yet.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>#</th>
                <th>Date</th>
                <th>Plan</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p, i) => (
                <tr key={p.id}>
                  <td className="muted">{i + 1}</td>
                  <td className="muted">{formatDate(p.paid_at)}</td>
                  <td>{p.plan_name}</td>
                  <td>{naira(p.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <SubscriptionModal
        owner={owner}
        primaryGym={primaryGym}
        open={subscriptionModalOpen}
        onClose={() => setSubscriptionModalOpen(false)}
        onOwnerChange={(patch) => setOwner((o) => ({ ...o, ...patch }))}
      />
    </div>
  );
}
