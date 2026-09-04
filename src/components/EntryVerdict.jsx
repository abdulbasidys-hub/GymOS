import StatusBadge from "./StatusBadge";

// The combined check-in verdict banner: two independent clocks, both must
// be green. See logic/entry.js for the (trivial) rule this renders.
export default function EntryVerdict({ membershipActive, equipmentActive }) {
  const allowed = membershipActive && equipmentActive;
  return (
    <div className={`verdict ${allowed ? "verdict--ok" : "verdict--bad"}`}>
      <div className="verdict__headline">
        {allowed ? "Entry allowed" : "Entry blocked"}
      </div>
      <div className="verdict__rows">
        <div className="verdict__row">
          <span>Membership</span>
          <StatusBadge active={membershipActive} />
        </div>
        <div className="verdict__row">
          <span>Equipment</span>
          <StatusBadge active={equipmentActive} />
        </div>
      </div>
    </div>
  );
}
