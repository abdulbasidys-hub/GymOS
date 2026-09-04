import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../auth";
import { listPaymentsByGym } from "../../data";
import FilterMenu from "../../components/FilterMenu";
import { formatMoney, formatDateTime, toDate, startOfDay } from "../../lib/helpers";

const RANGES = [
  { key: "today", label: "Today" },
  { key: "all", label: "All time" },
];

// What THIS receptionist collected — not the whole gym's payments (that's
// the owner's Finances page). Every payment already carries receptionist_uid
// (payments.js), so this is a client-side filter of the same gym-scoped read
// every receptionist already has.
export default function DeskFinances() {
  const { gymId, account, gym } = useAuth();
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [range, setRange] = useState("today");

  useEffect(() => {
    let alive = true;
    listPaymentsByGym(gymId)
      .then((p) => alive && setPayments(p.filter((x) => x.receptionist_uid === account?.id)))
      .catch(() => alive && setError("Couldn't load payments."))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [gymId, account?.id]);

  const filtered = useMemo(() => {
    const sorted = [...payments].sort(
      (a, b) => (toDate(b.paid_at)?.getTime() ?? 0) - (toDate(a.paid_at)?.getTime() ?? 0)
    );
    if (range === "all") return sorted;
    const todayStart = startOfDay(new Date()).getTime();
    return sorted.filter((p) => (toDate(p.paid_at)?.getTime() ?? 0) >= todayStart);
  }, [payments, range]);

  const total = filtered.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

  return (
    <>
      <div className="card">
        <div className="status-block__head">
          <h2>Payments you collected</h2>
          <FilterMenu options={RANGES} value={range} onChange={setRange} />
        </div>

        {error && <p className="form-error">{error}</p>}
        {loading ? (
          <p className="empty">Loading…</p>
        ) : (
          <>
            <p className="hint">
              Total: <strong>{formatMoney(total, gym?.currency_code, gym?.country_code)}</strong> across {filtered.length} payment(s).
            </p>
            {filtered.length === 0 ? (
              <p className="empty">No payments in this range.</p>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Plan</th>
                    <th>For</th>
                    <th>Amount</th>
                    <th>Time</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((p, i) => (
                    <tr key={p.id}>
                      <td className="muted">{i + 1}</td>
                      <td>{p.plan_name}</td>
                      <td className="muted">{p.for}</td>
                      <td>{formatMoney(p.amount, gym?.currency_code, gym?.country_code)}</td>
                      <td className="muted">{formatDateTime(p.paid_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
      </div>
    </>
  );
}
