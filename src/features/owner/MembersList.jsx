import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../auth";
import { listMembers, listMembershipRecordsByGym } from "../../data";
import { currentRecord, isActive } from "../../logic/expiry";
import { toDate } from "../../lib/helpers";
import StatusBadge from "../../components/StatusBadge";
import PhoneNumber from "../../components/PhoneNumber";
import SearchToggle from "../../components/SearchToggle";
import FilterMenu from "../../components/FilterMenu";

const FILTERS = [
  { key: "all", label: "All" },
  { key: "active", label: "Active Membership" },
  { key: "expired", label: "Expired Membership" },
  { key: "expiring", label: "Expiring Soon" },
];
const EXPIRING_WITHIN_DAYS = 30;

function expiresWithinDays(record, days, now = new Date()) {
  if (!record || !isActive(record.expiry_date, now)) return false;
  const expiry = toDate(record.expiry_date)?.getTime();
  return expiry != null && expiry <= now.getTime() + days * 24 * 60 * 60 * 1000;
}

// Any field captured at registration (RegisterMember.jsx) is fair game for
// the search box — not just name/member number.
function matchesQuery(member, query) {
  if (!query) return true;
  const fields = [
    member.name,
    member.member_no,
    member.phone,
    member.email,
    member.address,
    member.emergency_name,
    member.emergency_phone,
    ...Object.values(member.custom_fields || {}),
  ];
  return fields.some((f) => f != null && String(f).toLowerCase().includes(query));
}

// The owner's member directory — every member, alphabetical, filterable by
// membership standing, click through to MemberProfile for payment/
// attendance history (BUILD.md §8: owner has full R on members, same
// profile the desk role sees, minus the action buttons).
export default function MembersList() {
  const navigate = useNavigate();
  const { gymId } = useAuth();
  const [members, setMembers] = useState([]);
  const [membershipByMember, setMembershipByMember] = useState({});
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    Promise.all([listMembers(gymId), listMembershipRecordsByGym(gymId)])
      .then(([m, membership]) => {
        if (!alive) return;
        setMembers([...m].sort((a, b) => a.name.localeCompare(b.name)));
        const byMember = (records) => {
          const grouped = {};
          for (const r of records) (grouped[r.member_id] ??= []).push(r);
          return grouped;
        };
        setMembershipByMember(byMember(membership));
      })
      .catch(() => alive && setError("Couldn't load members."))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [gymId]);

  const visible = useMemo(() => {
    const now = new Date();
    const query = q.trim().toLowerCase();
    return members.filter((m) => {
      if (!matchesQuery(m, query)) return false;
      const membership = currentRecord(membershipByMember[m.id]);
      switch (filter) {
        case "active":
          return isActive(membership?.expiry_date, now);
        case "expired":
          return !isActive(membership?.expiry_date, now);
        case "expiring":
          return expiresWithinDays(membership, EXPIRING_WITHIN_DAYS, now);
        default:
          return true;
      }
    });
  }, [members, membershipByMember, q, filter]);

  if (loading) return <p className="empty">Loading…</p>;
  if (error) return <p className="form-error">{error}</p>;

  return (
    <div className="card">
      <div className="status-block__head">
        <h2>Members</h2>
        <div className="page-actions">
          <FilterMenu options={FILTERS} value={filter} onChange={setFilter} />
          <SearchToggle value={q} onChange={setQ} placeholder="Name or phone" />
        </div>
      </div>

      {members.length === 0 ? (
        <p className="empty">No members yet.</p>
      ) : visible.length === 0 ? (
        <p className="empty">No members match this filter.</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>#</th>
              <th>Member no.</th>
              <th>Name</th>
              <th>Phone</th>
              <th>Membership</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((m, i) => {
              const membership = currentRecord(membershipByMember[m.id]);
              return (
                <tr
                  key={m.id}
                  className="row--expandable"
                  onClick={() => navigate(`/owner/member/${m.id}`)}
                >
                  <td className="muted">{i + 1}</td>
                  <td>{m.member_no}</td>
                  <td>{m.name}</td>
                  <td><PhoneNumber value={m.phone} /></td>
                  <td>
                    <StatusBadge
                      active={isActive(membership?.expiry_date)}
                      activeLabel="Active"
                      inactiveLabel={membership ? "Expired" : "None"}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
