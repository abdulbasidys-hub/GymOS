import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listGyms, listAttendanceByGym } from "../../data";
import { formatDateTime, toDate } from "../../lib/helpers";
import { PLATFORMS, PLATFORM_LABELS } from "../../lib/platform";

// A platform counts as "in use" if it has been seen within this window. A
// gym that ran the desktop app once in March and has been on the web ever
// since should not still be listed as a desktop gym — the question this page
// answers is what they are using now, not what they have ever touched.
const IN_USE_DAYS = 30;

// Newest first: where a gym uses more than one client, the one they were on
// most recently is the one worth seeing first.
function platformsInUse(gym) {
  const clients = gym.clients ?? {};
  const now = Date.now();
  return PLATFORMS.map((p) => ({ platform: p, at: toDate(clients[p]) }))
    .filter(({ at }) => at && now - at.getTime() < IN_USE_DAYS * 24 * 60 * 60 * 1000)
    .sort((a, b) => b.at.getTime() - a.at.getTime());
}

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
            return { gym, lastSeen, platforms: platformsInUse(gym) };
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
        What each gym is running, and when they were last active — oldest first. &ldquo;Last
        active&rdquo; is their most recent check-in, since the web phase has no literal offline sync
        queue to watch yet. A gym can show more than one client: the desk on the installed app while
        the owner checks takings on their phone is normal.
      </p>
      {rows.length === 0 ? (
        <p className="empty">No gyms yet.</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>#</th>
              <th>Gym</th>
              <th>Running</th>
              <th>Client last opened</th>
              <th>Last active</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ gym, lastSeen, platforms }, i) => (
              <tr key={gym.id}>
                <td className="muted">{i + 1}</td>
                <td>
                  <Link to={`/admin/gyms/${gym.id}`}>{gym.name}</Link>
                </td>
                <td>
                  {platforms.length === 0 ? (
                    // Not the same as "nothing" — see the footnote below. A
                    // gym that has never signed in since this shipped looks
                    // identical to one that never signs in at all, and saying
                    // "Unknown" is the honest version of that.
                    <span className="muted">Unknown</span>
                  ) : (
                    // Plain .pill, no colour variant. Every existing
                    // variant means a STATUS (ok / bad / caution), and a gym
                    // on the browser is not doing worse than one on the
                    // desktop app — colouring these would invent a judgement
                    // that isn't there.
                    platforms.map(({ platform }) => (
                      <span className="pill" key={platform}>
                        {PLATFORM_LABELS[platform]}
                      </span>
                    ))
                  )}
                </td>
                <td className="muted">
                  {platforms.length === 0 ? "—" : formatDateTime(platforms[0].at)}
                </td>
                <td className="muted">{lastSeen ? formatDateTime(lastSeen) : "Never"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="muted hint">
        A gym reports its client when somebody signs in, so <strong>Unknown</strong> means nobody has
        opened it since this was added — not that they aren&rsquo;t using anything. A desk working
        offline on the desktop app also can&rsquo;t report until it next reaches the server. Anything
        not seen in {IN_USE_DAYS} days drops off.
      </p>
    </div>
  );
}
