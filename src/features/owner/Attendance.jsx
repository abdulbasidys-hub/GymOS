import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../auth";
import { listAttendanceByGym, listMembers, getUserRecord } from "../../data";
import ExpandableRow from "../../components/ExpandableRow";
import SearchToggle from "../../components/SearchToggle";
import FilterMenu from "../../components/FilterMenu";
import { formatDateTime, toDate, startOfDay } from "../../lib/helpers";

function startOfWeek(d = new Date()) {
  const x = startOfDay(d);
  const day = x.getDay();
  x.setDate(x.getDate() + ((day === 0 ? -6 : 1) - day));
  return x;
}
function startOfMonth(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

const RANGES = [
  { key: "today", label: "Today" },
  { key: "week", label: "This week" },
  { key: "month", label: "This month" },
  { key: "custom", label: "Custom" },
];

// Layered visibility (BUILD.md §9): base list for everyone, owner expands a
// row to see which receptionist recorded it. Filterable by date range and by
// member so the owner can answer "who came in today" or "when did X last
// check in" without scrolling the full history.
export default function Attendance() {
  const { gymId } = useAuth();
  const [rows, setRows] = useState([]);
  const [membersById, setMembersById] = useState({});
  const [receptionists, setReceptionists] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [range, setRange] = useState("today");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [q, setQ] = useState("");

  useEffect(() => {
    let alive = true;
    Promise.all([listAttendanceByGym(gymId), listMembers(gymId)])
      .then(([a, m]) => {
        if (!alive) return;
        setRows(
          a.sort((x, y) => (toDate(y.recorded_at)?.getTime() ?? 0) - (toDate(x.recorded_at)?.getTime() ?? 0))
        );
        setMembersById(Object.fromEntries(m.map((mm) => [mm.id, mm])));
      })
      .catch(() => alive && setError("Couldn't load attendance."))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [gymId]);

  async function loadReceptionist(uid) {
    if (!uid || receptionists[uid]) return;
    const rec = await getUserRecord(uid).catch(() => null);
    setReceptionists((prev) => ({ ...prev, [uid]: rec }));
  }

  const { start, end } = useMemo(() => {
    const now = new Date();
    if (range === "today") return { start: startOfDay(now), end: now };
    if (range === "week") return { start: startOfWeek(now), end: now };
    if (range === "month") return { start: startOfMonth(now), end: now };
    return {
      start: customStart ? new Date(customStart) : null,
      end: customEnd ? new Date(`${customEnd}T23:59:59`) : null,
    };
  }, [range, customStart, customEnd]);

  const filtered = useMemo(() => {
    if (range === "custom" && (!start || !end)) return [];
    const startMs = start ? start.getTime() : -Infinity;
    const endMs = end ? end.getTime() : Infinity;
    const query = q.trim().toLowerCase();
    return rows.filter((r) => {
      const at = toDate(r.recorded_at)?.getTime();
      if (at == null || at < startMs || at > endMs) return false;
      if (!query) return true;
      const member = membersById[r.member_id];
      return (
        member?.name?.toLowerCase().includes(query) ||
        member?.member_no?.toLowerCase().includes(query) ||
        member?.phone?.toLowerCase().includes(query)
      );
    });
  }, [rows, membersById, start, end, range, q]);

  if (loading) return <p className="empty">Loading…</p>;
  if (error) return <p className="form-error">{error}</p>;

  return (
    <>
    <div className="page-header">
      <h1>Attendance</h1>
      <p>Every check-in, filterable by date range and searchable by member.</p>
    </div>

    <div className="card">
      <div className="status-block__head">
        <h2>Check-ins</h2>
        <div className="page-actions">
          <FilterMenu options={RANGES} value={range} onChange={setRange} />
          <SearchToggle value={q} onChange={setQ} placeholder="Name, member no. or phone" />
        </div>
      </div>

      {range === "custom" && (
        <div className="row2 section-top">
          <label className="field">
            <span>From</span>
            <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} />
          </label>
          <label className="field">
            <span>To</span>
            <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} />
          </label>
        </div>
      )}

      {range === "custom" && (!start || !end) ? (
        <p className="muted hint section-top">Pick a date range to see attendance.</p>
      ) : filtered.length === 0 ? (
        <p className="empty">No attendance in this range.</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th></th>
              <th>#</th>
              <th>Member no.</th>
              <th>Name</th>
              <th>Time</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r, i) => {
              const member = membersById[r.member_id];
              return (
                <ExpandableRow
                  key={r.id}
                  cells={[i + 1, member?.member_no || "—", member?.name || "—", formatDateTime(r.recorded_at)]}
                  onExpand={() => loadReceptionist(r.receptionist_uid)}
                >
                  <p className="muted">
                    Recorded by {receptionists[r.receptionist_uid]?.name || "…"}
                  </p>
                </ExpandableRow>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
    </>
  );
}
