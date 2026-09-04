import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../auth";
import { listMembers } from "../../data";
import PhoneNumber from "../../components/PhoneNumber";

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

// Two independent search boxes sharing one result list: name/phone (free
// text) and member number (the gym's prefix is fixed, the receptionist only
// types the numeric suffix). Both filter the gym's member roster — fetched
// once on load, not re-queried per keystroke — client-side, live. Browsing
// the full roster without searching lives on its own page (Members tab),
// not here — this page is purely "find one person fast."
export default function CheckIn() {
  const navigate = useNavigate();
  const { gymId, gym } = useAuth();
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [qNamePhone, setQNamePhone] = useState("");
  const [qMemberNo, setQMemberNo] = useState("");

  useEffect(() => {
    let alive = true;
    listMembers(gymId)
      .then((m) => alive && setMembers(m))
      .catch(() => alive && setError("Couldn't load members."))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [gymId]);

  const results = useMemo(() => {
    const nameQ = qNamePhone.trim().toLowerCase();
    const numQ = qMemberNo.trim().toLowerCase();
    if (!nameQ && !numQ) return [];

    const matched = new Map();
    if (nameQ) {
      for (const m of members) {
        if (m.name?.toLowerCase().includes(nameQ) || m.phone?.toLowerCase().includes(nameQ)) {
          matched.set(m.id, m);
        }
      }
    }
    if (numQ) {
      for (const m of members) {
        if (m.member_no?.toLowerCase().includes(numQ)) matched.set(m.id, m);
      }
    }
    return [...matched.values()];
  }, [members, qNamePhone, qMemberNo]);

  const searched = qNamePhone.trim() !== "" || qMemberNo.trim() !== "";

  return (
    <>
      <div className="page-header">
        <h1>Check-in</h1>
        <p>Search by name, phone, or member number to find who's here.</p>
      </div>

      <div className="card">
        <h2>Find a member</h2>
        {error && <p className="form-error">{error}</p>}
        <div className="search-stack">
          <label className="field">
            <span>Name or phone</span>
            <div className="field__control">
              <SearchIcon />
              <input value={qNamePhone} onChange={(e) => setQNamePhone(e.target.value)} autoFocus />
            </div>
          </label>
          <label className="field">
            <span>Member number</span>
            <div className="username-combo">
              <span className="username-combo__prefix">{gym?.prefix ? `${gym.prefix}-` : ""}</span>
              <input value={qMemberNo} onChange={(e) => setQMemberNo(e.target.value)} />
            </div>
          </label>
        </div>

        {loading ? (
          <p className="empty">Loading…</p>
        ) : searched && results.length === 0 ? (
          <p className="empty">No matches.</p>
        ) : results.length > 0 ? (
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
              {results.map((m, i) => (
                <tr key={m.id} className="row--expandable" onClick={() => navigate(`/desk/member/${m.id}`)}>
                  <td className="muted">{i + 1}</td>
                  <td>{m.member_no}</td>
                  <td>{m.name}</td>
                  <td><PhoneNumber value={m.phone} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </div>
    </>
  );
}
