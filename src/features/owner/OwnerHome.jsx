import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../auth";
import {
  listAttendanceByGym,
  listPaymentsByGym,
  listMembers,
  listMembershipRecordsByGym,
} from "../../data";
import { sumAmounts, filterByRange } from "../../logic/revenue";
import { expiringSoon } from "../../logic/expiry";
import { dailyBuckets } from "../../logic/timeseries";
import { formatMoney, toDate, startOfDay } from "../../lib/helpers";
import TrendChart from "../../components/TrendChart";

const TREND_DAYS = 14;

function startOfWeek(d = new Date()) {
  const x = startOfDay(d);
  const day = x.getDay();
  x.setDate(x.getDate() + ((day === 0 ? -6 : 1) - day)); // Monday start
  return x;
}

export default function OwnerHome() {
  const { gymId, gym } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [stats, setStats] = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [attendance, payments, members, membershipRecords] = await Promise.all([
          listAttendanceByGym(gymId),
          listPaymentsByGym(gymId),
          listMembers(gymId),
          listMembershipRecordsByGym(gymId),
        ]);
        if (!alive) return;

        const now = new Date();
        const today = startOfDay(now);
        const todayAttendance = attendance.filter(
          (a) => (toDate(a.recorded_at)?.getTime() ?? 0) >= today.getTime()
        );

        setStats({
          todayAttendance: todayAttendance.length,
          todayRevenue: sumAmounts(filterByRange(payments, today, now)),
          weekRevenue: sumAmounts(filterByRange(payments, startOfWeek(now), now)),
          activeMembers: members.filter((m) => m.active !== false).length,
          expiringCount: expiringSoon(membershipRecords, 7, now).length,
          revenueTrend: dailyBuckets(payments, TREND_DAYS, (p) => p.paid_at, (p) => Number(p.amount) || 0, now),
          attendanceTrend: dailyBuckets(attendance, TREND_DAYS, (a) => a.recorded_at, () => 1, now),
        });
      } catch (err) {
        console.error(err);
        if (alive) setError("Couldn't load the dashboard.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [gymId]);

  if (loading) return <p className="empty">Loading…</p>;
  if (error) return <p className="form-error">{error}</p>;

  return (
    <>
      <div className="page-header">
        <h1>Dashboard</h1>
        <p>A live snapshot of today's attendance, revenue, and membership health.</p>
      </div>

      <div className="stat-grid stat-grid--row">
        <Link to="/owner/attendance" className="stat-card stat-card--link stat-card--compact">
          <div className="stat-card__label">
            <span className="stat-card__dot" />
            Today's attendance
          </div>
          <div className="stat-card__value">{stats.todayAttendance}</div>
        </Link>
        <Link to="/owner/finances" className="stat-card stat-card--link stat-card--compact">
          <div className="stat-card__label">
            <span className="stat-card__dot" />
            Today's revenue
          </div>
          <div className="stat-card__value">{formatMoney(stats.todayRevenue, gym?.currency_code, gym?.country_code)}</div>
        </Link>
        <Link to="/owner/finances" className="stat-card stat-card--link stat-card--compact">
          <div className="stat-card__label">
            <span className="stat-card__dot" />
            This week's revenue
          </div>
          <div className="stat-card__value">{formatMoney(stats.weekRevenue, gym?.currency_code, gym?.country_code)}</div>
        </Link>
        <Link to="/owner/members" className="stat-card stat-card--link stat-card--compact">
          <div className="stat-card__label">
            <span className="stat-card__dot stat-card__dot--ok" />
            Active members
          </div>
          <div className="stat-card__value">{stats.activeMembers}</div>
        </Link>
        <Link to="/owner/expiring" className="stat-card stat-card--link stat-card--compact">
          <div className="stat-card__label">
            <span className="stat-card__dot stat-card__dot--caution" />
            Expiring in 7 days
          </div>
          <div className={`stat-card__value ${stats.expiringCount > 0 ? "stat-card__value--warn" : ""}`}>
            {stats.expiringCount}
          </div>
        </Link>
      </div>

      <div className="trend-grid">
        <TrendChart data={stats.revenueTrend} valueLabel="Revenue" formatValue={(v) => formatMoney(v, gym?.currency_code, gym?.country_code)} />
        <TrendChart data={stats.attendanceTrend} valueLabel="Check-ins" formatValue={(v) => String(v)} />
      </div>
    </>
  );
}
