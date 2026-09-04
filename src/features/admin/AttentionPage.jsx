import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listGyms, listAttendanceByGym } from "../../data";
import { licenseStatus, daysRemaining } from "../../logic/license";
import { syncHealth, issueFor } from "../../logic/gymHealth";
import { toDate, formatDateTime, capitalize } from "../../lib/helpers";

const PRIORITY_PILL = { High: "pill--bad", Medium: "pill--caution", Low: "pill--warn" };
const PRIORITY_ORDER = { High: 0, Medium: 1, Low: 2 };

export default function AttentionPage() {
  const [attention, setAttention] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const gyms = await listGyms();
        const now = new Date();

        const rows = await Promise.all(
          gyms.map(async (gym) => {
            const attendance = await listAttendanceByGym(gym.id);
            const status = licenseStatus(gym, now);
            const remaining = daysRemaining(gym.subscription?.expiry_date, now);
            const dates = attendance.map((a) => toDate(a.recorded_at)).filter(Boolean);
            const lastSeen = dates.length ? new Date(Math.max(...dates.map((d) => d.getTime()))) : null;
            const health = syncHealth(lastSeen, now);
            const info = issueFor({ status, remaining, health });
            return info && { gym, status, lastSeen, issue: info.issue, priority: info.priority };
          })
        );

        if (!alive) return;
        setAttention(
          rows.filter(Boolean).sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority])
        );
      } catch (err) {
        console.error(err);
        if (alive) setError("Couldn't load gyms needing attention.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  return (
    <>
      <Link to="/admin" className="back-link">
        ← Dashboard
      </Link>

      <div className="card">
        <h2>Gyms Needing Attention</h2>
        {error && <p className="form-error">{error}</p>}
        {loading ? (
          <p className="empty">Loading…</p>
        ) : attention.length === 0 ? (
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
                <th></th>
              </tr>
            </thead>
            <tbody>
              {attention.map(({ gym, status, issue, lastSeen, priority }, i) => (
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
                  <td>
                    <Link to={`/admin/gyms/${gym.id}`} className="btn btn--inline">
                      View →
                    </Link>
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
