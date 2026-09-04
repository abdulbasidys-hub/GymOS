// A green/red pill for any active-vs-not state (membership, equipment,
// gym status, plan status, ...).
export default function StatusBadge({
  active,
  activeLabel = "Active",
  inactiveLabel = "Expired",
}) {
  return (
    <span className={`pill ${active ? "pill--active" : "pill--bad"}`}>
      {active ? activeLabel : inactiveLabel}
    </span>
  );
}
