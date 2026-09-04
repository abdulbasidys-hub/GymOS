import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../auth";
import { listMembershipRecordsByGym, listEquipmentRecordsByGym, listMembers } from "../../data";
import { expiringSoon } from "../../logic/expiry";
import { formatDate, toDate } from "../../lib/helpers";

// The renewal chase list — membership + equipment expiring within 7 days
// (BUILD.md §9).
export default function ExpiringSoon() {
  const { gymId } = useAuth();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    Promise.all([
      listMembershipRecordsByGym(gymId),
      listEquipmentRecordsByGym(gymId),
      listMembers(gymId),
    ])
      .then(([mRecords, eRecords, members]) => {
        if (!alive) return;
        const membersById = Object.fromEntries(members.map((m) => [m.id, m]));
        const membership = expiringSoon(mRecords, 7).map((r) => ({ ...r, kind: "Membership" }));
        const equipment = expiringSoon(eRecords, 7).map((r) => ({ ...r, kind: "Equipment" }));
        const combined = [...membership, ...equipment]
          .map((r) => ({ ...r, member: membersById[r.member_id] }))
          .sort((a, b) => (toDate(a.expiry_date)?.getTime() ?? 0) - (toDate(b.expiry_date)?.getTime() ?? 0));
        setRows(combined);
      })
      .catch(() => alive && setError("Couldn't load the renewal chase list."))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [gymId]);

  if (loading) return <p className="empty">Loading…</p>;
  if (error) return <p className="form-error">{error}</p>;

  return (
    <div className="card">
      <h2>Expiring soon (7 days)</h2>
      {rows.length === 0 ? (
        <p className="empty">Nothing expiring in the next week.</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>#</th>
              <th>Member no.</th>
              <th>Name</th>
              <th>Track</th>
              <th>Plan</th>
              <th>Expires</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id}>
                <td className="muted">{i + 1}</td>
                <td>{r.member?.member_no || "—"}</td>
                <td>
                  <Link to={`/owner/member/${r.member_id}`}>{r.member?.name || "—"}</Link>
                </td>
                <td>{r.kind}</td>
                <td>{r.plan_name}</td>
                <td className="status-text status-text--grace">{formatDate(r.expiry_date)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
