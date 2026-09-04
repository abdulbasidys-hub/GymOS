import { useEffect, useState } from "react";
import { useAuth } from "../../auth";
import { listGymsByAffiliate, getOwnerForGym } from "../../data";
import StatusBadge from "../../components/StatusBadge";
import PhoneNumber from "../../components/PhoneNumber";
import { formatDate } from "../../lib/helpers";

// The affiliate's Gyms sub-page — every gym they referred, with its owner's
// name and phone right in the row. No per-gym earnings column: commission is
// a fixed rate (Revenue tab covers the money side), so there's nothing to
// differentiate one gym's row from another there.
export default function AffiliateGyms() {
  const { account } = useAuth();
  const affiliateId = account?.id;

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!affiliateId) return;
    let alive = true;
    listGymsByAffiliate(affiliateId)
      .then(async (gyms) => {
        const owners = await Promise.all(gyms.map((g) => getOwnerForGym(g.id).catch(() => null)));
        if (!alive) return;
        setRows(gyms.map((gym, i) => ({ gym, owner: owners[i] })));
      })
      .catch(() => alive && setError("Couldn't load your gyms."))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [affiliateId]);

  return (
    <>
      <div className="card">
        <h2>Gyms</h2>
        {error && <p className="form-error">{error}</p>}
        {loading ? (
          <p className="empty">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="empty">No gyms referred yet.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>#</th>
                <th>Gym</th>
                <th>Owner</th>
                <th>Phone</th>
                <th>Status</th>
                <th>Since</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ gym, owner }, i) => (
                <tr key={gym.id}>
                  <td className="muted">{i + 1}</td>
                  <td>{gym.name}</td>
                  <td>{owner?.name || <span className="muted">—</span>}</td>
                  <td><PhoneNumber value={owner?.phone} /></td>
                  <td>
                    <StatusBadge active={gym.status === "active"} activeLabel="Active" inactiveLabel="Suspended" />
                  </td>
                  <td className="muted">{formatDate(gym.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
