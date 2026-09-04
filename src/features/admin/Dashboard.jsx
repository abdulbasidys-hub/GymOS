import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  listGyms,
  listMembers,
  listStaff,
  listAttendanceByGym,
  listRecentAdminActivity,
} from "../../data";
import ExpandableActivity from "../../components/ExpandableActivity";
import { licenseStatus, daysRemaining } from "../../logic/license";
import { syncHealth, issueFor } from "../../logic/gymHealth";
import { toDate, startOfDay, formatDateTime, capitalize } from "../../lib/helpers";

const PRIORITY_PILL = { High: "pill--bad", Medium: "pill--caution", Low: "pill--warn" };
const PRIORITY_ORDER = { High: 0, Medium: 1, Low: 2 };
const PREVIEW_LIMIT = 10;
const ACTIVITY_FETCH_LIMIT = 300;

export default function Dashboard() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [stats, setStats] = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [gyms, recentActivity] = await Promise.all([
          listGyms(),
          listRecentAdminActivity(ACTIVITY_FETCH_LIMIT),
        ]);

        const perGym = await Promise.all(
          gyms.map(async (gym) => {
            const [members, staff, attendance] = await Promise.all([
              listMembers(gym.id),
              listStaff(gym.id),
              listAttendanceByGym(gym.id),
            ]);
            return { gym, members, staff, attendance };
          })
        );

        if (!alive) return;

        const now = new Date();
        const todayStart = startOfDay(now);

        const lockedGyms = gyms.filter((g) => licenseStatus(g, now) === "locked").length;
        const totalMembers = perGym.reduce((sum, p) => sum + p.members.length, 0);
        const totalStaff = perGym.reduce((sum, p) => sum + p.staff.length, 0);
        const checkInsToday = perGym.reduce(
          (sum, p) =>
            sum +
            p.attendance.filter((a) => (toDate(a.recorded_at)?.getTime() ?? 0) >= todayStart.getTime()).length,
          0
        );

        const attention = perGym
          .map(({ gym, attendance }) => {
            const status = licenseStatus(gym, now);
            const remaining = daysRemaining(gym.subscription?.expiry_date, now);
            const dates = attendance.map((a) => toDate(a.recorded_at)).filter(Boolean);
            const lastSeen = dates.length ? new Date(Math.max(...dates.map((d) => d.getTime()))) : null;
            const health = syncHealth(lastSeen, now);
            const info = issueFor({ status, remaining, health });
            return info && { gym, status, lastSeen, issue: info.issue, priority: info.priority };
          })
          .filter(Boolean)
          .sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);

        setStats({
          totalGyms: gyms.length,
          activeGyms: gyms.length - lockedGyms,
          lockedGyms,
          totalMembers,
          totalStaff,
          checkInsToday,
          recentActivity,
          attention,
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
  }, []);

  if (loading) return <p className="empty">Loading…</p>;
  if (error) return <p className="form-error">{error}</p>;

  return (
    <>
      <div className="page-header">
        <h1>Dashboard</h1>
        <p>Platform-wide totals across every gym, plus what needs attention.</p>
      </div>

      <div className="stat-grid stat-grid--row">
        <Link to="/admin/sync" className="stat-card stat-card--link stat-card--compact">
          <div className="stat-card__label">
            <span className="stat-card__dot" />
            Today's Attendance
          </div>
          <div className="stat-card__value">{stats.checkInsToday}</div>
        </Link>
        <Link to="/admin/gyms" className="stat-card stat-card--link stat-card--compact">
          <div className="stat-card__label">
            <span className="stat-card__dot" />
            Total Members
          </div>
          <div className="stat-card__value">{stats.totalMembers}</div>
        </Link>
        <Link to="/admin/gyms" className="stat-card stat-card--link stat-card--compact">
          <div className="stat-card__label">
            <span className="stat-card__dot" />
            Total Staff
          </div>
          <div className="stat-card__value">{stats.totalStaff}</div>
        </Link>
        <Link to="/admin/gyms?status=active" className="stat-card stat-card--link stat-card--compact">
          <div className="stat-card__label">
            <span className="stat-card__dot stat-card__dot--ok" />
            Active Gyms
          </div>
          <div className="stat-card__value">{stats.activeGyms}</div>
        </Link>
        <Link to="/admin/gyms?status=locked" className="stat-card stat-card--link stat-card--compact">
          <div className="stat-card__label">
            <span className="stat-card__dot stat-card__dot--bad" />
            Locked Gyms
          </div>
          <div className="stat-card__value">{stats.lockedGyms}</div>
        </Link>
        <Link to="/admin/gyms" className="stat-card stat-card--link stat-card--compact">
          <div className="stat-card__label">
            <span className="stat-card__dot" />
            Total Gyms
          </div>
          <div className="stat-card__value">{stats.totalGyms}</div>
        </Link>
      </div>

      <div className="card">
        <h2>Recent Gym Activity</h2>
        <ExpandableActivity
          entries={stats.recentActivity}
          dateOf={(entry) => toDate(entry.at)}
          columns={["#", "Gym Name", "Activity", "Performed By", "Date/Time", "Status"]}
          renderRow={(entry, i) => (
            <tr key={entry.id}>
              <td className="muted">{i + 1}</td>
              <td>{entry.gym_name}</td>
              <td>{entry.activity}</td>
              <td className="muted">{entry.performed_by}</td>
              <td className="muted">{formatDateTime(entry.at)}</td>
              <td>
                <strong className={`status-text status-text--${entry.status}`}>
                  {capitalize(entry.status)}
                </strong>
              </td>
            </tr>
          )}
        />
      </div>

      <div className="card card--link" onClick={() => navigate("/admin/attention")}>
        <div className="status-block__head">
          <h2>Gyms Needing Attention</h2>
          <span className="muted">
            View all →
          </span>
        </div>
        {stats.attention.length === 0 ? (
          <p className="empty">All gyms look healthy.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>#</th>
                <th>Gym Name</th>
                <th>Issue</th>
                <th>Subscription Status</th>
                <th>Last Sync</th>
                <th>Priority</th>
              </tr>
            </thead>
            <tbody>
              {stats.attention.slice(0, PREVIEW_LIMIT).map(({ gym, status, issue, lastSeen, priority }, i) => (
                <tr key={gym.id}>
                  <td className="muted">{i + 1}</td>
                  <td>{gym.name}</td>
                  <td>{issue}</td>
                  <td>
                    <strong className={`status-text status-text--${status}`}>{capitalize(status)}</strong>
                  </td>
                  <td className="muted">{lastSeen ? formatDateTime(lastSeen) : "Never"}</td>
                  <td>
                    <span className={`pill ${PRIORITY_PILL[priority]}`}>{priority}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
