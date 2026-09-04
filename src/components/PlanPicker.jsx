import { formatMoney } from "../lib/helpers";

// Pick a plan (membership tier or equipment plan) — used at registration,
// payment collection, and renewal. Retired plans (active:false) are hidden;
// they stay in the list for history, never for new sales. `currencyCode`/
// `countryCode` come from the gym these plans belong to (a plan's price is
// always member-facing money, so it always renders in the GYM's own
// currency — see formatMoney's own note on why that's different from the
// platform-billing pages, which stay in one fixed reference currency).
export default function PlanPicker({ plans, value, onChange, currencyCode, countryCode, emptyText = "No plans yet." }) {
  const selectable = (plans || []).filter((p) => p.active !== false);
  if (selectable.length === 0) return <p className="empty">{emptyText}</p>;

  return (
    <div className="plan-picker">
      {selectable.map((p) => (
        <label
          key={p.id}
          className={`plan-option ${value === p.id ? "plan-option--selected" : ""}`}
        >
          <input
            type="radio"
            name="plan"
            value={p.id}
            checked={value === p.id}
            onChange={() => onChange(p.id)}
          />
          <span className="plan-option__name">{p.name}</span>
          <span className="plan-option__meta">
            {p.type === "equipment"
              ? `${p.duration_count} ${p.duration_unit}${p.duration_count > 1 ? "s" : ""}`
              : "1 year"}
          </span>
          <span className="plan-option__price">{formatMoney(p.price, currencyCode, countryCode)}</span>
        </label>
      ))}
    </div>
  );
}
