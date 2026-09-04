import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../auth";
import { listEarningsByAffiliate } from "../../data";
import StatusBadge from "../../components/StatusBadge";
import FilterMenu from "../../components/FilterMenu";
import { naira, formatDateTime, toDate } from "../../lib/helpers";

function startOfMonth(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

const RANGES = [
  { key: "month", label: "This month" },
  { key: "lastMonth", label: "Last month" },
  { key: "all", label: "All time" },
];

// The affiliate's Revenue sub-page — what they're making and whether each
// payout has landed yet. Defaults to the current month (most relevant to
// "did this month's payments come through"), with last-month/all-time to
// look further back. The "paid at month end" note sits at the bottom, after
// the numbers, rather than as a banner above them.
export default function AffiliateRevenue() {
  const { account } = useAuth();
  const affiliateId = account?.id;

  const [earnings, setEarnings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [range, setRange] = useState("month");

  useEffect(() => {
    if (!affiliateId) return;
    let alive = true;
    listEarningsByAffiliate(affiliateId)
      .then((e) => {
        if (!alive) return;
        setEarnings(e.sort((a, b) => (toDate(b.created_at)?.getTime() ?? 0) - (toDate(a.created_at)?.getTime() ?? 0)));
      })
      .catch(() => alive && setError("Couldn't load your earnings."))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [affiliateId]);

  const filtered = useMemo(() => {
    if (range === "all") return earnings;
    const now = new Date();
    if (range === "month") {
      const start = startOfMonth(now).getTime();
      return earnings.filter((e) => (toDate(e.created_at)?.getTime() ?? 0) >= start);
    }
    // lastMonth
    const startThis = startOfMonth(now);
    const startLast = new Date(startThis.getFullYear(), startThis.getMonth() - 1, 1).getTime();
    const endLast = startThis.getTime();
    return earnings.filter((e) => {
      const at = toDate(e.created_at)?.getTime() ?? 0;
      return at >= startLast && at < endLast;
    });
  }, [earnings, range]);

  const pending = earnings.filter((e) => e.status !== "paid").reduce((sum, e) => sum + (Number(e.earned_amount) || 0), 0);
  const paidAllTime = earnings.filter((e) => e.status === "paid").reduce((sum, e) => sum + (Number(e.earned_amount) || 0), 0);

  return (
    <>
      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-card__label">
            <span className="stat-card__dot stat-card__dot--caution" />
            Pending payout
          </div>
          <div className="stat-card__value">{naira(pending)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card__label">
            <span className="stat-card__dot stat-card__dot--ok" />
            Paid all-time
          </div>
          <div className="stat-card__value">{naira(paidAllTime)}</div>
        </div>
      </div>

      <div className="card">
        <div className="status-block__head">
          <h2>Earnings history</h2>
          <FilterMenu options={RANGES} value={range} onChange={setRange} />
        </div>
        {error && <p className="form-error">{error}</p>}
        {loading ? (
          <p className="empty">Loading…</p>
        ) : earnings.length === 0 ? (
          <p className="empty">Nothing earned yet.</p>
        ) : filtered.length === 0 ? (
          <p className="empty">Nothing earned in this range.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>#</th>
                <th>Date</th>
                <th>Gym</th>
                <th>Payment</th>
                <th>Commission</th>
                <th>You earned</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((e, i) => (
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

      <div className="notice">Payments are made at the end of every month.</div>
    </>
  );
}
