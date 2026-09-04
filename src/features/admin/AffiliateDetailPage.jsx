import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import {
  listAffiliates,
  listGymsByAffiliate,
  listEarningsByAffiliate,
  setUserActive,
} from "../../data";
import StatusBadge from "../../components/StatusBadge";
import PhoneNumber from "../../components/PhoneNumber";
import { naira, formatDate, formatDateTime, toDate } from "../../lib/helpers";

// One marketer's full picture for super-admin — reached by tapping a name on
// either Marketers sub-page (the roster or the payouts table), never from
// the nav bar directly.
export default function AffiliateDetailPage() {
  const { affiliateId } = useParams();
  const [affiliate, setAffiliate] = useState(null);
  const [gyms, setGyms] = useState([]);
  const [earnings, setEarnings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    Promise.all([listAffiliates(), listGymsByAffiliate(affiliateId), listEarningsByAffiliate(affiliateId)])
      .then(([affiliates, g, e]) => {
        if (!alive) return;
        setAffiliate(affiliates.find((a) => a.id === affiliateId) || null);
        setGyms(g);
        setEarnings(e.sort((a, b) => (toDate(b.created_at)?.getTime() ?? 0) - (toDate(a.created_at)?.getTime() ?? 0)));
      })
      .catch(() => alive && setError("Couldn't load this marketer."))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [affiliateId]);

  async function toggleActive() {
    setBusy(true);
    setError("");
    try {
      await setUserActive(affiliate.id, !affiliate.active);
      setAffiliate((prev) => ({ ...prev, active: !prev.active }));
    } catch {
      setError("Couldn't update this account.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <p className="empty">Loading…</p>;
  if (error && !affiliate) return <p className="form-error">{error}</p>;
  if (!affiliate) return <p className="empty">Marketer not found.</p>;

  const pending = earnings.filter((e) => e.status !== "paid").reduce((sum, e) => sum + (Number(e.earned_amount) || 0), 0);
  const paidAllTime = earnings.filter((e) => e.status === "paid").reduce((sum, e) => sum + (Number(e.earned_amount) || 0), 0);

  const earnedByGym = new Map();
  for (const e of earnings) {
    earnedByGym.set(e.gym_id, (earnedByGym.get(e.gym_id) || 0) + (Number(e.earned_amount) || 0));
  }

  return (
    <div>
      <Link className="back-link" to="/admin/marketers">&larr; Back to marketers</Link>

      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-card__label">Current unpaid</div>
          <div className="stat-card__value">{naira(pending)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card__label">All time paid earnings</div>
          <div className="stat-card__value">{naira(paidAllTime)}</div>
        </div>
      </div>

      <div className="card">
        <div className="status-block__head">
          <h2>{affiliate.name}</h2>
          <StatusBadge active={affiliate.active} activeLabel="Active" inactiveLabel="Deactivated" />
        </div>
        <div className="detail-grid">
          <div>
            <h4>Username</h4>
            <p>{affiliate.username}</p>
          </div>
          <div>
            <h4>Phone</h4>
            <p><PhoneNumber value={affiliate.phone} /></p>
          </div>
          <div>
            <h4>Email</h4>
            <p>{affiliate.email || <span className="muted">Not provided</span>}</p>
          </div>
          <div>
            <h4>Bank</h4>
            <p>{affiliate.bank_name || <span className="muted">Not provided</span>}</p>
          </div>
          <div>
            <h4>Account number</h4>
            <p>{affiliate.account_number || <span className="muted">Not provided</span>}</p>
          </div>
        </div>

        {error && <div className="form-error">{error}</div>}

        <div className="form-actions">
          <button className="btn btn--inline" onClick={toggleActive} disabled={busy}>
            {busy ? "Working…" : affiliate.active ? "Deactivate" : "Reactivate"}
          </button>
        </div>
      </div>

      <div className="card">
        <h2>Gyms brought</h2>
        {gyms.length === 0 ? (
          <p className="empty">No gyms referred yet.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>#</th>
                <th>Gym</th>
                <th>Status</th>
                <th>Since</th>
                <th>Earned from this gym</th>
              </tr>
            </thead>
            <tbody>
              {gyms.map((g, i) => (
                <tr key={g.id}>
                  <td className="muted">{i + 1}</td>
                  <td>
                    <Link to={`/admin/gyms/${g.id}`}>{g.name}</Link>
                  </td>
                  <td>
                    <StatusBadge active={g.status === "active"} activeLabel="Active" inactiveLabel="Suspended" />
                  </td>
                  <td className="muted">{formatDate(g.created_at)}</td>
                  <td>{naira(earnedByGym.get(g.id) || 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <h2>Earnings history</h2>
        {earnings.length === 0 ? (
          <p className="empty">Nothing earned yet.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>#</th>
                <th>Date</th>
                <th>Gym</th>
                <th>Payment</th>
                <th>Commission</th>
                <th>Earned</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {earnings.map((e, i) => (
                <tr key={e.id}>
                  <td className="muted">{i + 1}</td>
                  <td className="muted">{formatDateTime(e.created_at)}</td>
                  <td>{e.gym_name}</td>
                  <td className="muted">{naira(e.payment_amount)}</td>
                  <td className="muted">{e.commission_percent}%</td>
                  <td>{naira(e.earned_amount)}</td>
                  <td>
                    <StatusBadge active={e.status === "paid"} activeLabel="Paid" inactiveLabel="Pending" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
