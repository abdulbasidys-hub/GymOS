import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import {
  listAffiliates,
  listGymsByAffiliate,
  listEarningsByAffiliate,
  setUserActive,
  getPlatformSettings,
  setAffiliateCommissionOverride,
} from "../../data";
import Modal from "../../components/Modal";
import StatusBadge from "../../components/StatusBadge";
import PhoneNumber from "../../components/PhoneNumber";
import { naira, formatDate, formatDateTime, toDate } from "../../lib/helpers";
import {
  MAX_COMMISSION_PERCENT,
  commissionOptions,
  hasOwnCommissionRate,
  resolveCommissionPercent,
} from "../../logic/commission";

// One marketer's full picture for super-admin — reached by tapping a name on
// either Marketers sub-page (the roster or the payouts table), never from
// the nav bar directly.
export default function AffiliateDetailPage() {
  const { affiliateId } = useParams();
  const [affiliate, setAffiliate] = useState(null);
  const [gyms, setGyms] = useState([]);
  const [earnings, setEarnings] = useState([]);
  const [defaultPercent, setDefaultPercent] = useState(0);
  const [commissionModalOpen, setCommissionModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    Promise.all([
      listAffiliates(),
      listGymsByAffiliate(affiliateId),
      listEarningsByAffiliate(affiliateId),
      getPlatformSettings(),
    ])
      .then(([affiliates, g, e, settings]) => {
        if (!alive) return;
        setAffiliate(affiliates.find((a) => a.id === affiliateId) || null);
        setGyms(g);
        setEarnings(e.sort((a, b) => (toDate(b.created_at)?.getTime() ?? 0) - (toDate(a.created_at)?.getTime() ?? 0)));
        setDefaultPercent(Number(settings.affiliate_commission_percent) || 0);
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

  const ownRate = hasOwnCommissionRate(affiliate);
  const effectivePercent = resolveCommissionPercent(affiliate, defaultPercent);

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
        <div className="status-block__head">
          <h2>Commission</h2>
          <button className="btn btn--inline" onClick={() => setCommissionModalOpen(true)}>
            Edit
          </button>
        </div>
        <p className="muted hint">
          {ownRate
            ? "This marketer has their own rate. Changing the platform default won't move it."
            : `Following the platform default (${defaultPercent}%). Set a rate here to give this marketer their own.`}
        </p>
        <p className="stat-card__value">
          {effectivePercent}%{" "}
          {!ownRate && <span className="muted hint">default</span>}
        </p>
        <p className="muted hint">
          Applies to payments recorded from now on. Earnings already in the history below keep the rate
          they were recorded at.
        </p>
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

      <EditAffiliateCommissionModal
        open={commissionModalOpen}
        onClose={() => setCommissionModalOpen(false)}
        affiliate={affiliate}
        defaultPercent={defaultPercent}
        onChanged={(percent) => setAffiliate((prev) => ({ ...prev, commission_percent: percent }))}
      />
    </div>
  );
}

// One marketer's own commission rate, or "use the platform default". Two
// controls rather than one, because "follow the default" and "a fixed 30%"
// are genuinely different states and a single dropdown can't express both
// without a magic entry that reads like a real percentage.
//
// Saving null is what puts them back on the default — see
// setAffiliateCommissionOverride. Everything is capped at
// MAX_COMMISSION_PERCENT by the option list itself, so there is no way to
// pick a number the cap would reject.
function EditAffiliateCommissionModal({ open, onClose, affiliate, defaultPercent, onChanged }) {
  const [useOwn, setUseOwn] = useState(false);
  const [value, setValue] = useState("0");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    const own = hasOwnCommissionRate(affiliate);
    setUseOwn(own);
    // When they're on the default, the dropdown opens showing the default
    // itself rather than 0 — so switching to "their own rate" starts from
    // what they're actually earning today, not from nothing.
    setValue(String(resolveCommissionPercent(affiliate, defaultPercent)));
    setError("");
  }, [open, affiliate, defaultPercent]);

  async function submit(e) {
    e.preventDefault();
    setError("");
    const percent = useOwn ? Number(value) : null;
    if (useOwn && (Number.isNaN(percent) || percent < 0 || percent > MAX_COMMISSION_PERCENT)) {
      return setError(`Pick a percentage between 0 and ${MAX_COMMISSION_PERCENT}.`);
    }
    setBusy(true);
    try {
      await setAffiliateCommissionOverride(affiliate.id, percent);
      onChanged(percent);
      onClose();
    } catch {
      setError("Couldn't save this marketer's commission.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={`Commission — ${affiliate?.name ?? ""}`}>
      <form onSubmit={submit}>
        <label className="field">
          <span>Rate</span>
          <select value={useOwn ? "own" : "default"} onChange={(e) => setUseOwn(e.target.value === "own")}>
            <option value="default">Platform default ({defaultPercent}%)</option>
            <option value="own">A rate just for this marketer</option>
          </select>
        </label>

        {useOwn && (
          <label className="field">
            <span>Commission (%)</span>
            <select value={value} onChange={(e) => setValue(e.target.value)} required>
              {commissionOptions(affiliate?.commission_percent).map((p) => (
                <option key={p} value={String(p)}>
                  {p}%
                </option>
              ))}
            </select>
          </label>
        )}

        <p className="muted hint">
          {useOwn
            ? `Capped at ${MAX_COMMISSION_PERCENT}% — the platform keeps at least half of every payment.`
            : "They'll follow the default, including any later change to it."}
        </p>

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
