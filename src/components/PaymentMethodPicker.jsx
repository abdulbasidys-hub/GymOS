// How the money arrived: cash in the drawer, or a bank transfer.
//
// The desk has always recorded WHAT was paid and by WHOM; this records HOW,
// which is the thing an owner needs at the end of a shift. Cash should match
// what is physically in the drawer and transfers should match what is in the
// bank, and without this the two are added together into one number that
// reconciles against neither.
//
// Defaults to cash because that is what most of a Nigerian gym's takings
// are, and because a default that matches the common case is one fewer tap
// on every single payment.
const METHODS = [
  { value: "cash", label: "Cash" },
  { value: "transfer", label: "Transfer" },
];

export default function PaymentMethodPicker({ value, onChange, disabled = false }) {
  return (
    <div className="pay-method">
      <span className="pay-method__label">Paid by</span>
      <div className="pay-method__options">
        {METHODS.map((m) => (
          <label
            key={m.value}
            className={`pay-method__option ${value === m.value ? "pay-method__option--on" : ""}`}
          >
            {/* A real radio, hidden but present: it keeps keyboard support
                and screen-reader semantics that a div with an onClick would
                throw away. */}
            <input
              type="radio"
              name="payment-method"
              value={m.value}
              checked={value === m.value}
              onChange={() => onChange(m.value)}
              disabled={disabled}
            />
            {m.label}
          </label>
        ))}
      </div>
    </div>
  );
}
