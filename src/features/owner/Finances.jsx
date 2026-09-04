import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../auth";
import { listPaymentsByGym, listMembers, getUserRecord } from "../../data";
import ExpandableRow from "../../components/ExpandableRow";
import FilterMenu from "../../components/FilterMenu";
import { sumAmounts, filterByRange } from "../../logic/revenue";
import { formatMoney, formatDateTime, toDate, startOfDay } from "../../lib/helpers";

function startOfWeek(d = new Date()) {
  const x = startOfDay(d);
  const day = x.getDay();
  x.setDate(x.getDate() + ((day === 0 ? -6 : 1) - day));
  return x;
}
function startOfMonth(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

// Ordered by widening scope, with Custom last as the "none of the above"
// option. "All time" sits at the end of the fixed ranges: without it the
// widest view was one month, so answering "what has this gym taken in
// total?" meant guessing a custom start date early enough to cover
// everything.
const RANGES = [
  { key: "daily", label: "Daily" },
  { key: "weekly", label: "Weekly" },
  { key: "monthly", label: "Monthly" },
  { key: "all", label: "All time" },
  { key: "custom", label: "Custom" },
];

// Everything money-related on one page: pick a range, see the total, the
// per-plan breakdown, and the transaction list — no separate "Reports"
// destination to navigate to first.
export default function Finances() {
  const { gymId, gym } = useAuth();
  const [payments, setPayments] = useState([]);
  const [membersById, setMembersById] = useState({});
  const [receptionists, setReceptionists] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [range, setRange] = useState("daily");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");

  useEffect(() => {
    let alive = true;
    Promise.all([listPaymentsByGym(gymId), listMembers(gymId)])
      .then(([p, m]) => {
        if (!alive) return;
        setPayments(p);
        setMembersById(Object.fromEntries(m.map((mm) => [mm.id, mm])));
      })
      .catch(() => alive && setError("Couldn't load payments."))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [gymId]);

  async function loadReceptionist(uid) {
    if (!uid || receptionists[uid]) return;
    const rec = await getUserRecord(uid).catch(() => null);
    setReceptionists((prev) => ({ ...prev, [uid]: rec }));
  }

  const { start, end } = useMemo(() => {
    const now = new Date();
    if (range === "daily") return { start: startOfDay(now), end: now };
    if (range === "weekly") return { start: startOfWeek(now), end: now };
    if (range === "monthly") return { start: startOfMonth(now), end: now };
    // Both null — logic/revenue.js's filterByRange reads a null bound as
    // -Infinity/+Infinity, so this needs no special case downstream.
    if (range === "all") return { start: null, end: null };
    return {
      start: customStart ? new Date(customStart) : null,
      end: customEnd ? new Date(`${customEnd}T23:59:59`) : null,
    };
  }, [range, customStart, customEnd]);

  const filtered = useMemo(() => {
    if (range === "custom" && (!start || !end)) return [];
    return filterByRange(payments, start, end).sort(
      (a, b) => (toDate(b.paid_at)?.getTime() ?? 0) - (toDate(a.paid_at)?.getTime() ?? 0)
    );
  }, [payments, start, end, range]);

  const total = sumAmounts(filtered);

  if (loading) return <p className="empty">Loading…</p>;
  if (error) return <p className="form-error">{error}</p>;

  return (
    <>
      <div className="page-header">
        <h1>Finances</h1>
        <p>Revenue collected, by range — no separate reports page to dig through.</p>
      </div>

      <div className="card">
        <div className="status-block__head">
          <h2>Revenue summary</h2>
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
            Total: <strong>{formatMoney(total, gym?.currency_code, gym?.country_code)}</strong> across {filtered.length} payment(s).
          </p>
        )}
      </div>

      <div className="card">
        <h2>Transactions</h2>
        {filtered.length === 0 ? (
          <p className="empty">No payments in this range.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th></th>
                <th>#</th>
                <th>Member no.</th>
                <th>Name</th>
                <th>For</th>
                <th>Amount</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p, i) => {
                const member = membersById[p.member_id];
                return (
                  <ExpandableRow
                    key={p.id}
                    cells={[
                      i + 1,
                      member?.member_no || "—",
                      member?.name || "—",
                      p.plan_name,
                      formatMoney(p.amount, gym?.currency_code, gym?.country_code),
                      formatDateTime(p.paid_at),
                    ]}
                    onExpand={() => loadReceptionist(p.receptionist_uid)}
                  >
                    <p className="muted">
                      Collected by {receptionists[p.receptionist_uid]?.name || "…"}
                    </p>
                  </ExpandableRow>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
