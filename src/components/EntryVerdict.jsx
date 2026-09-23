// The combined check-in verdict banner. logic/entry.js owns the rule; this
// only renders it.
//
// Equipment shows three states, not two. "Pending" is a real, correct,
// allowed state — paid for, starting at this check-in — and showing it as
// red "Expired" (which this used to do) told the desk a payment had failed
// when it had not. That is what makes a receptionist charge somebody twice.
export default function EntryVerdict({ membershipActive, equipmentActive, equipmentPending }) {
  const equipmentOk = equipmentActive || equipmentPending;
  const allowed = membershipActive && equipmentOk;

  return (
    <div className={`verdict ${allowed ? "verdict--ok" : "verdict--bad"}`}>
      <div className="verdict__headline">
        {allowed ? "Entry allowed" : "Entry blocked"}
      </div>
      <div className="verdict__rows">
        <div className="verdict__row">
          <span>Membership</span>
          <span className={`pill ${membershipActive ? "pill--active" : "pill--bad"}`}>
            {membershipActive ? "Active" : "Expired"}
          </span>
        </div>
        <div className="verdict__row">
          <span>Equipment</span>
          {/* Amber, not green: it IS allowed, but it is not the same thing as
              active, and the desk should be able to see at a glance that this
              member's equipment clock starts today. */}
          <span
            className={`pill ${
              equipmentActive ? "pill--active" : equipmentPending ? "pill--caution" : "pill--bad"
            }`}
          >
            {equipmentActive ? "Active" : equipmentPending ? "Starts today" : "Expired"}
          </span>
        </div>
      </div>
    </div>
  );
}
