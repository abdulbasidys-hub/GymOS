import { useEffect, useMemo, useState } from "react";
import { listPlatformPayments, listAllAffiliateEarnings } from "../../data";
import FilterMenu from "../../components/FilterMenu";
import { naira, formatDate, toDate, startOfDay } from "../../lib/helpers";

const CARDS_HIDDEN_KEY = "gymos-admin-revenue-cards-hidden";

function startOfWeek(d = new Date()) {
  const x = startOfDay(d);
  const day = x.getDay();
  x.setDate(x.getDate() + ((day === 0 ? -6 : 1) - day));
  return x;
}
function startOfMonth(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

const RANGES = [
  { key: "month", label: "This month" },
  { key: "today", label: "Today" },
  { key: "week", label: "This week" },
  { key: "all", label: "All time" },
  { key: "custom", label: "Custom" },
];

function isThisMonth(date, now) {
  return date && date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
}

export default function Revenue() {
  const [payments, setPayments] = useState([]);
  const [earnings, setEarnings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [cardsHidden, setCardsHidden] = useState(() => localStorage.getItem(CARDS_HIDDEN_KEY) === "true");
  const [range, setRange] = useState("month");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");

  useEffect(() => {
    let alive = true;
    Promise.all([listPlatformPayments(), listAllAffiliateEarnings()])
      .then(([p, e]) => {
        if (!alive) return;
        setPayments(p.sort((a, b) => (toDate(b.paid_at)?.getTime() ?? 0) - (toDate(a.paid_at)?.getTime() ?? 0)));
        setEarnings(e);
      })
      .catch(() => alive && setError("Couldn't load revenue."))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  function toggleCardsHidden() {
    setCardsHidden((prev) => {
      const next = !prev;
      localStorage.setItem(CARDS_HIDDEN_KEY, String(next));
      return next;
    });
  }

  const { start, end } = useMemo(() => {
    const now = new Date();
    if (range === "today") return { start: startOfDay(now), end: now };
    if (range === "week") return { start: startOfWeek(now), end: now };
    if (range === "month") return { start: startOfMonth(now), end: now };
    if (range === "all") return { start: null, end: null };
    return {
      start: customStart ? new Date(customStart) : null,
      end: customEnd ? new Date(`${customEnd}T23:59:59`) : null,
    };
  }, [range, customStart, customEnd]);

  const filtered = useMemo(() => {
    if (range === "custom" && (!start || !end)) return [];
    const startMs = start ? start.getTime() : -Infinity;
    const endMs = end ? end.getTime() : Infinity;
    return payments.filter((p) => {
      const at = toDate(p.paid_at)?.getTime();
      return at != null && at >= startMs && at <= endMs;
    });
  }, [payments, start, end, range]);

  if (loading) return <p className="empty">Loading…</p>;
  if (error) return <p className="form-error">{error}</p>;

  const now = new Date();
  const allTime = payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  const thisMonth = payments
    .filter((p) => isThisMonth(toDate(p.paid_at), now))
    .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  // Still owed to affiliates for this month — drops as each is marked paid
  // (MarketersRevenue.jsx), so it naturally resets to 0 once the month's
  // payout run is done.
  const affiliatePayoutThisMonth = earnings
    .filter((e) => e.status !== "paid" && isThisMonth(toDate(e.created_at), now))
    .reduce((sum, e) => sum + (Number(e.earned_amount) || 0), 0);

  const filteredTotal = filtered.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

  return (
    <>
      <div className="page-header">
        <h1>Revenue</h1>
        <p>Platform-wide subscription revenue and affiliate payouts.</p>
      </div>

      <div className="section-toolbar">
        <button className="btn btn--inline" onClick={toggleCardsHidden}>
          {cardsHidden ? "Show cards" : "Hide cards"}
        </button>
      </div>

      {!cardsHidden && (
        <div className="stat-grid">
          <div className="stat-card">
            <div className="stat-card__label">Revenue this month</div>
            <div className="stat-card__value">{naira(thisMonth)}</div>
          </div>
          <div className="stat-card">
            <div className="stat-card__label">Affiliate payout (this month)</div>
            <div className="stat-card__value">{naira(affiliatePayoutThisMonth)}</div>
          </div>
          <div className="stat-card">
            <div className="stat-card__label">All time revenue</div>
            <div className="stat-card__value">{naira(allTime)}</div>
          </div>
        </div>
      )}

      <div className="card">
        <div className="status-block__head">
          <h2>Payments</h2>
          <FilterMenu options={RANGES} value={range} onChange={setRange} />
        </div>

        {range === "custom" && (
          <div className="row2">
            <label className="field">
              <span>From</span>
              <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} />
            </label>
            <label className="field">
              <span>To</span>
              <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} />
            </label>
          </div>
        )}

        {range === "custom" && (!start || !end) ? (
          <p className="muted hint">Pick a date range to see revenue.</p>
        ) : (
          <p className="hint">
            Total: <strong>{naira(filteredTotal)}</strong> across {filtered.length} payment(s).
          </p>
        )}

        {filtered.length === 0 ? (
          range === "custom" && (!start || !end) ? null : (
            <p className="empty">No payments in this range.</p>
          )
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>#</th>
                <th>Date</th>
                <th>Account</th>
                <th>Plan</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p, i) => (
                <tr key={p.id}>
                  <td className="muted">{i + 1}</td>
                  <td className="muted">{formatDate(p.paid_at)}</td>
                  {/* owner_name (BUILD.md §6, pooled billing) — gym_name is
                      the fallback for payments recorded before that change. */}
                  <td>{p.owner_name ?? p.gym_name}</td>
                  <td className="muted">{p.plan_name}</td>
                  <td>{naira(p.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
