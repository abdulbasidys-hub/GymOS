import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listGyms, listAttendanceByGym } from "../../data";
import { formatDateTime, toDate } from "../../lib/helpers";

export default function SyncMonitor() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const gyms = await listGyms();
        const withActivity = await Promise.all(
          gyms.map(async (gym) => {
            const attendance = await listAttendanceByGym(gym.id);
            const dates = attendance.map((a) => toDate(a.recorded_at)).filter(Boolean);
            const lastSeen = dates.length ? new Date(Math.max(...dates.map((d) => d.getTime()))) : null;
            return { gym, lastSeen };
          })
        );

        if (!alive) return;
        withActivity.sort((a, b) => (a.lastSeen?.getTime() ?? -1) - (b.lastSeen?.getTime() ?? -1));
        setRows(withActivity);
      } catch (err) {
        console.error(err);
        if (alive) setError("Couldn't load sync status.");
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
    <div className="card">
      <h2>Sync Monitor</h2>
      <p className="muted hint">
        Based on each gym's most recent check-in, since the web phase has no literal offline sync queue to
        watch yet — oldest first.
      </p>
      {rows.length === 0 ? (
        <p className="empty">No gyms yet.</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>#</th>
              <th>Gym</th>
              <th>Last synced</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ gym, lastSeen }, i) => (
              <tr key={gym.id}>
                <td className="muted">{i + 1}</td>
                <td>
                  <Link to={`/admin/gyms/${gym.id}`}>{gym.name}</Link>
                </td>
                <td className="muted">{lastSeen ? formatDateTime(lastSeen) : "Never"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
