import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../auth";
import { listMembers } from "../../data";
import PhoneNumber from "../../components/PhoneNumber";
import SearchToggle from "../../components/SearchToggle";

// The desk's browsable roster — every member, alphabetical, with a search
// box for narrowing it. Separate from CheckIn.jsx on purpose: that page is
// "find one person fast" (two purpose-built boxes, no browsing); this one is
// "let me see who's on the books" without needing to search for anything.
export default function DeskMembers() {
  const navigate = useNavigate();
  const { gymId } = useAuth();
  const [members, setMembers] = useState([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    listMembers(gymId)
      .then((m) => alive && setMembers([...m].sort((a, b) => a.name.localeCompare(b.name))))
      .catch(() => alive && setError("Couldn't load members."))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [gymId]);

  const visible = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return members;
    return members.filter(
      (m) =>
        m.name?.toLowerCase().includes(query) ||
        m.member_no?.toLowerCase().includes(query) ||
        m.phone?.toLowerCase().includes(query)
    );
  }, [members, q]);

  return (
    <>
      <div className="card">
        <div className="status-block__head">
          <h2>Members ({members.length})</h2>
          <SearchToggle value={q} onChange={setQ} placeholder="Name, member no. or phone" />
        </div>
        {error && <p className="form-error">{error}</p>}
        {loading ? (
          <p className="empty">Loading…</p>
        ) : members.length === 0 ? (
          <p className="empty">No members yet.</p>
        ) : visible.length === 0 ? (
          <p className="empty">No matches.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>#</th>
                <th>Member no.</th>
                <th>Name</th>
                <th>Phone</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((m, i) => (
                <tr key={m.id} className="row--expandable" onClick={() => navigate(`/desk/member/${m.id}`)}>
                  <td className="muted">{i + 1}</td>
                  <td>{m.member_no}</td>
                  <td>{m.name}</td>
                  <td><PhoneNumber value={m.phone} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
