import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../auth";
import { listMembers, listPaymentsByGym, listAttendanceByGym } from "../../data";
import { ensureBootstrapped } from "../../data/local/bootstrap";
import { pullRemoteChanges, pullFactAndMembers } from "../../data/local/pull";
import StatusBadge from "../../components/StatusBadge";
import FilterMenu from "../../components/FilterMenu";
import { licenseStatus } from "../../logic/license";
import { sumAmounts, filterByRange } from "../../logic/revenue";
import { formatMoney, startOfDay, toDate } from "../../lib/helpers";

function startOfMonth(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

// This page used to hardcode "this month", which left an owner with no way
// to ask what a branch has taken in total. Only two options are needed
// here: the month is the operational view, all time is the lifetime one.
const RANGES = [
  { key: "month", label: "This month" },
  { key: "all", label: "All time" },
];

// Owners managing more than one branch only (BUILD.md §6) — OwnerDashboard
// only routes here when branches.length > 1. Every branch stays
// continuously synced in the background already (auth.jsx), so this reads
// straight from local/Firestore per branch with no on-demand Electron
// bootstrap of its own... except a device that's NEVER been signed in
// before local data has landed yet, which the guard below covers.
export default function CrossBranchReport() {
  const navigate = useNavigate();
  const { branches, setActiveGym } = useAuth();
  const [rows, setRows] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  // Every branch's payments are already fetched in full below, so switching
  // range re-sums what's in memory rather than refetching — hence a plain
  // state value the revenue useMemo keys off, not another effect.
  const [range, setRange] = useState("month");

  useEffect(() => {
    if (branches.length === 0) return;
    let alive = true;
    (async () => {
      try {
        // Best-effort — a device signing in for the very first time won't
        // have every branch's local data yet even though the background
        // loop in auth.jsx is already working on it; this just makes sure
        // THIS screen doesn't show empty/stale numbers while that catches
        // up, on Electron only (no-op on the web build, and each call
        // already guards on window.gymOS?.isElectron itself).
        for (const b of branches) {
          await ensureBootstrapped(b.id);
          await pullRemoteChanges(b.id, { role: "owner" });
          await pullFactAndMembers(b.id, { role: "owner" });
        }

        const now = new Date();
        const monthStart = startOfMonth(now);
        const today = startOfDay(now);

        const perBranch = await Promise.all(
          branches.map(async (b) => {
            const [members, payments, attendance] = await Promise.all([
              listMembers(b.id),
              listPaymentsByGym(b.id),
              listAttendanceByGym(b.id),
            ]);
            return {
              gym: b,
              activeMembers: members.filter((m) => m.active !== false).length,
              todayAttendance: attendance.filter((a) => (toDate(a.recorded_at)?.getTime() ?? 0) >= today.getTime()).length,
              monthRevenue: sumAmounts(filterByRange(payments, monthStart, now)),
              // filterByRange treats null bounds as -Infinity/+Infinity.
              allTimeRevenue: sumAmounts(payments),
              status: licenseStatus(b, now),
            };
          })
        );
        if (alive) setRows(perBranch);
      } catch (err) {
        console.error(err);
        if (alive) setError("Couldn't load some branches — showing what loaded.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [branches]);

  if (loading) return <p className="empty">Loading…</p>;
  if (!rows || rows.length === 0) return <p className="empty">No branches to show.</p>;

  const totalMembers = rows.reduce((sum, r) => sum + r.activeMembers, 0);
  const totalAttendanceToday = rows.reduce((sum, r) => sum + r.todayAttendance, 0);
  // Revenue only sums cleanly when every branch shares one currency (a
  // gym's currency_code is permanent, set at creation) — same reasoning
  // lib/helpers.js's naira() documents for platform-level aggregation.
  // Mixed-currency owners still see every branch's own total in the table
  // below, just not a meaningless combined figure here.
  const firstCurrency = rows[0].gym.currency_code;
  const oneCurrency = rows.every((r) => r.gym.currency_code === firstCurrency);
  const revenueOf = (r) => (range === "all" ? r.allTimeRevenue : r.monthRevenue);
  const totalRevenue = oneCurrency ? rows.reduce((sum, r) => sum + revenueOf(r), 0) : null;
  const revenueLabel = range === "all" ? "All-time revenue" : "This month's revenue";

  function openBranch(gymId) {
    setActiveGym(gymId);
    navigate("/owner");
  }

  return (
    <>
      <div className="page-header">
        <h1>All branches</h1>
        <p>A combined view across every branch you manage.</p>
      </div>

      <div className="toolbar">
        <FilterMenu options={RANGES} value={range} onChange={setRange} />
      </div>

      {error && <p className="form-error">{error}</p>}

      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-card__label">Branches</div>
          <div className="stat-card__value">{rows.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card__label">Active members</div>
          <div className="stat-card__value">{totalMembers}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card__label">Today's attendance</div>
          <div className="stat-card__value">{totalAttendanceToday}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card__label">{revenueLabel}</div>
          <div className="stat-card__value">
            {oneCurrency ? formatMoney(totalRevenue, firstCurrency, rows[0].gym.country_code) : <span className="muted">Mixed currencies</span>}
          </div>
        </div>
      </div>

      <div className="card">
        <h2>By branch</h2>
        <table className="table">
          <thead>
            <tr>
              <th>#</th>
              <th>Branch</th>
              <th>Status</th>
              <th>Members</th>
              <th>Today</th>
              <th>{range === "all" ? "All time" : "This month"}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.gym.id} className="row--expandable" onClick={() => openBranch(r.gym.id)}>
                <td className="muted">{i + 1}</td>
                <td>{r.gym.name}</td>
                <td>
                  <StatusBadge active={r.status === "active"} activeLabel="Active" inactiveLabel={r.status === "grace" ? "In grace" : "Locked"} />
                </td>
                <td className="muted">{r.activeMembers}</td>
                <td className="muted">{r.todayAttendance}</td>
                <td>{formatMoney(revenueOf(r), r.gym.currency_code, r.gym.country_code)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
