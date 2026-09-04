import { useEffect, useState } from "react";
import { useAuth } from "../../auth";
import {
  createPlan,
  listPlans,
  updatePlan,
  retirePlan,
  reactivatePlan,
  createCustomField,
  listCustomFields,
  updateCustomField,
  retireCustomField,
  reactivateCustomField,
  deleteCustomField,
} from "../../data";
import Modal from "../../components/Modal";
import StatusBadge from "../../components/StatusBadge";
import ThemePreference from "../../components/ThemePreference";
import ChangePasswordForm from "../../components/ChangePasswordForm";
import { licenseStatus } from "../../logic/license";
import { formatMoney, formatDate, capitalize } from "../../lib/helpers";

const DURATION_UNITS = ["day", "week", "month", "year"];
const FIELD_TYPES = [
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "yesno", label: "Yes / No" },
];
const FIELD_TYPE_LABEL = Object.fromEntries(FIELD_TYPES.map((t) => [t.value, t.label]));

// Everything the owner can configure, on one page: read-only gym identity
// (BUILD.md §7 gives the owner R, not U, on `gyms` — name/prefix/subscription
// are the platform's to manage), the plans they DO control, and appearance.
export default function GymSettings() {
  const { gym, gymId } = useAuth();
  const [plans, setPlans] = useState([]);
  const [plansLoading, setPlansLoading] = useState(true);
  const [plansError, setPlansError] = useState("");
  const [customFields, setCustomFields] = useState([]);
  const [customFieldsLoading, setCustomFieldsLoading] = useState(true);
  const [customFieldsError, setCustomFieldsError] = useState("");
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    listPlans(gymId)
      .then((p) => alive && setPlans(p))
      .catch(() => alive && setPlansError("Couldn't load plans."))
      .finally(() => alive && setPlansLoading(false));
    return () => {
      alive = false;
    };
  }, [gymId]);

  useEffect(() => {
    let alive = true;
    listCustomFields(gymId)
      .then((f) => alive && setCustomFields(f))
      .catch(() => alive && setCustomFieldsError("Couldn't load registration fields."))
      .finally(() => alive && setCustomFieldsLoading(false));
    return () => {
      alive = false;
    };
  }, [gymId]);

  function upsertPlan(plan) {
    setPlans((prev) => {
      const exists = prev.some((p) => p.id === plan.id);
      const next = exists
        ? prev.map((p) => (p.id === plan.id ? { ...p, ...plan } : p))
        : [...prev, plan];
      return next.sort((a, b) => a.name.localeCompare(b.name));
    });
  }

  function upsertCustomField(field) {
    setCustomFields((prev) => {
      const exists = prev.some((f) => f.id === field.id);
      return exists ? prev.map((f) => (f.id === field.id ? { ...f, ...field } : f)) : [...prev, field];
    });
  }

  function removeCustomField(fieldId) {
    setCustomFields((prev) => prev.filter((f) => f.id !== fieldId));
  }

  if (!gym) return <p className="empty">Loading…</p>;

  const status = licenseStatus(gym);

  return (
    <>
      <div className="card">
        <h2>Gym settings</h2>
        <div className="detail-grid">
          <div>
            <h4>Identity</h4>
            <p>{gym.name}</p>
            <p className="muted">Member prefix: {gym.prefix} (permanent, set by your provider)</p>
          </div>
          <div>
            <h4>Status</h4>
            <p>
              <StatusBadge active={gym.status === "active"} activeLabel="Active" inactiveLabel="Suspended" />
            </p>
          </div>
          <div>
            <h4>Subscription</h4>
            <p className="muted">
              {gym.subscription?.expiry_date
                ? `Expires ${formatDate(gym.subscription.expiry_date)}`
                : "Not yet set."}{" "}
              — <strong className={`status-text status-text--${status}`}>{capitalize(status)}</strong>
            </p>
            <p className="muted hint">Managed by your provider — contact them to renew or make changes.</p>
          </div>
        </div>
      </div>

      {plansError && <div className="form-error">{plansError}</div>}
      <PlanSection
        title="Membership tiers"
        type="membership"
        gymId={gymId}
        plans={plans.filter((p) => p.type === "membership")}
        loading={plansLoading}
        onChange={upsertPlan}
        currencyCode={gym?.currency_code}
        countryCode={gym?.country_code}
      />
      <PlanSection
        title="Equipment plans"
        type="equipment"
        gymId={gymId}
        plans={plans.filter((p) => p.type === "equipment")}
        loading={plansLoading}
        onChange={upsertPlan}
        currencyCode={gym?.currency_code}
        countryCode={gym?.country_code}
      />

      {customFieldsError && <div className="form-error">{customFieldsError}</div>}
      <CustomFieldsSection
        gymId={gymId}
        fields={customFields}
        loading={customFieldsLoading}
        onChange={upsertCustomField}
        onDelete={removeCustomField}
      />

      <div className="card">
        <h2>Appearance</h2>
        <p className="muted">Choose how GymOS looks on this device.</p>
        <div className="section-top">
          <ThemePreference />
        </div>
      </div>

      <div className="form-actions">
        <button className="btn btn--inline" onClick={() => setPasswordModalOpen(true)}>
          Change password
        </button>
      </div>
      <Modal open={passwordModalOpen} onClose={() => setPasswordModalOpen(false)} title="Change password">
        <ChangePasswordForm showTitle={false} />
      </Modal>
    </>
  );
}

function PlanSection({ title, type, gymId, plans, loading, onChange, currencyCode, countryCode }) {
  const [modalOpen, setModalOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState(null);

  async function toggleRetire(plan) {
    setBusy(true);
    setError("");
    try {
      if (plan.active) await retirePlan(plan.id);
      else await reactivatePlan(plan.id);
      onChange({ id: plan.id, active: !plan.active });
    } catch {
      setError("Couldn't update the plan.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <div className="status-block__head">
        <h2>{title}</h2>
        <button className="btn btn--inline" onClick={() => setModalOpen(true)}>
          Create plan
        </button>
      </div>

      {error && <div className="form-error">{error}</div>}

      {loading ? (
        <p className="empty">Loading…</p>
      ) : plans.length === 0 ? (
        <p className="empty">No {title.toLowerCase()} yet.</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>#</th>
              <th>Name</th>
              <th>Duration</th>
              <th>Price</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {plans.map((p, i) => (
              <PlanRow
                key={p.id}
                index={i}
                plan={p}
                busy={busy}
                setBusy={setBusy}
                setError={setError}
                editing={editingId === p.id}
                onEdit={() => setEditingId(p.id)}
                onCancelEdit={() => setEditingId(null)}
                onToggleRetire={() => toggleRetire(p)}
                onSaved={onChange}
                currencyCode={currencyCode}
                countryCode={countryCode}
              />
            ))}
          </tbody>
        </table>
      )}

      <CreatePlanModal open={modalOpen} onClose={() => setModalOpen(false)} type={type} gymId={gymId} onCreated={onChange} />
    </div>
  );
}

function CreatePlanModal({ open, onClose, type, gymId, onCreated }) {
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [durationUnit, setDurationUnit] = useState("month");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function handleClose() {
    onClose();
    setTimeout(() => {
      setName("");
      setPrice("");
      setDurationUnit("month");
      setError("");
    }, 0);
  }

  async function submit(e) {
    e.preventDefault();
    setError("");
    if (!name.trim()) return setError("Enter a plan name.");
    if (!price || Number(price) <= 0) return setError("Enter a price.");

    setBusy(true);
    try {
      const plan = await createPlan({
        gymId,
        type,
        name: name.trim(),
        price: Number(price),
        durationCount: 1,
        durationUnit,
      });
      onCreated(plan);
      handleClose();
    } catch {
      setError("Couldn't create the plan.");
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={handleClose} title={type === "equipment" ? "Create an equipment plan" : "Create a membership tier"}>
      <form onSubmit={submit}>
        <div className="row2">
          <label className="field">
            <span>Name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
          </label>
          <label className="field">
            <span>Price</span>
            <input type="number" min="0" value={price} onChange={(e) => setPrice(e.target.value)} required />
          </label>
        </div>
        {type === "equipment" ? (
          <label className="field">
            <span>Duration unit</span>
            <select value={durationUnit} onChange={(e) => setDurationUnit(e.target.value)}>
              {DURATION_UNITS.map((u) => (
                <option key={u} value={u}>
                  {capitalize(u)}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <p className="muted hint">Membership tiers always run for 1 year.</p>
        )}

        {error && <div className="form-error">{error}</div>}

        <div className="form-actions">
          <button className="btn btn--primary btn--inline" type="submit" disabled={busy}>
            {busy ? "Creating…" : "Create plan"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function PlanRow({ index, plan, busy, setBusy, setError, editing, onEdit, onCancelEdit, onToggleRetire, onSaved, currencyCode, countryCode }) {
  const [name, setName] = useState(plan.name);
  const [price, setPrice] = useState(plan.price);
  const [durationUnit, setDurationUnit] = useState(plan.duration_unit);

  async function save() {
    setBusy(true);
    setError("");
    try {
      // durationCount is deliberately omitted — plans.js's updatePlan strips
      // undefined fields, so this leaves duration_count untouched rather
      // than silently rewriting it.
      await updatePlan(plan.id, { name, price, durationUnit });
      onSaved({
        id: plan.id,
        name: String(name).trim(),
        price: Number(price),
        duration_unit: durationUnit,
      });
      onCancelEdit();
    } catch {
      setError("Couldn't save changes.");
    } finally {
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <tr>
        <td className="muted">{index + 1}</td>
        <td>
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </td>
        <td>
          {plan.type === "equipment" ? (
            <select value={durationUnit} onChange={(e) => setDurationUnit(e.target.value)}>
              {DURATION_UNITS.map((u) => (
                <option key={u} value={u}>
                  {capitalize(u)}
                </option>
              ))}
            </select>
          ) : (
            "1 year"
          )}
        </td>
        <td>
          <input type="number" min="0" style={{ width: 90 }} value={price} onChange={(e) => setPrice(e.target.value)} />
        </td>
        <td>
          <StatusBadge active={plan.active} activeLabel="Active" inactiveLabel="Retired" />
        </td>
        <td>
          <button className="btn btn--inline" onClick={save} disabled={busy}>
            Save
          </button>{" "}
          <button className="btn btn--inline" onClick={onCancelEdit} disabled={busy}>
            Cancel
          </button>
        </td>
      </tr>
    );
  }

  return (
    <tr>
      <td className="muted">{index + 1}</td>
      <td>{plan.name}</td>
      <td>
        {plan.type === "equipment"
          ? `${plan.duration_count} ${plan.duration_unit}${plan.duration_count > 1 ? "s" : ""}`
          : "1 year"}
      </td>
      <td>{formatMoney(plan.price, currencyCode, countryCode)}</td>
      <td>
        <StatusBadge active={plan.active} activeLabel="Active" inactiveLabel="Retired" />
      </td>
      <td>
        <button className="btn btn--inline" onClick={onEdit} disabled={busy}>
          Edit
        </button>{" "}
        <button className="btn btn--inline" onClick={onToggleRetire} disabled={busy}>
          {plan.active ? "Retire" : "Reactivate"}
        </button>
      </td>
    </tr>
  );
}

// Extra questions collected at registration, beyond the built-in set
// (RegisterMember.jsx) — same create/edit/retire shape as PlanSection above.
function CustomFieldsSection({ gymId, fields, loading, onChange, onDelete }) {
  const [modalOpen, setModalOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState(null);

  async function toggleRetire(field) {
    setBusy(true);
    setError("");
    try {
      if (field.active) await retireCustomField(field.id);
      else await reactivateCustomField(field.id);
      onChange({ id: field.id, active: !field.active });
    } catch {
      setError("Couldn't update the field.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(field) {
    if (!window.confirm(`Permanently delete "${field.label}"? This can't be undone.`)) return;
    setBusy(true);
    setError("");
    try {
      await deleteCustomField(field.id);
      onDelete(field.id);
    } catch {
      setError("Couldn't delete the field.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <div className="status-block__head">
        <h2>Registration fields</h2>
        <button className="btn btn--inline" onClick={() => setModalOpen(true)}>
          Add field
        </button>
      </div>
      <p className="muted hint">
        Extra questions your desk collects when registering a new member, on top of the built-in set
        (name, phone, gender, weight, height, emergency contact, address).
      </p>

      {error && <div className="form-error">{error}</div>}

      {loading ? (
        <p className="empty">Loading…</p>
      ) : fields.length === 0 ? (
        <p className="empty">No extra fields yet.</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>#</th>
              <th>Field</th>
              <th>Type</th>
              <th>Required</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {fields.map((f, i) => (
              <CustomFieldRow
                key={f.id}
                index={i}
                field={f}
                busy={busy}
                setBusy={setBusy}
                setError={setError}
                editing={editingId === f.id}
                onEdit={() => setEditingId(f.id)}
                onCancelEdit={() => setEditingId(null)}
                onToggleRetire={() => toggleRetire(f)}
                onDelete={() => remove(f)}
                onSaved={onChange}
              />
            ))}
          </tbody>
        </table>
      )}

      <AddFieldModal open={modalOpen} onClose={() => setModalOpen(false)} gymId={gymId} onCreated={onChange} />
    </div>
  );
}

function AddFieldModal({ open, onClose, gymId, onCreated }) {
  const [label, setLabel] = useState("");
  const [type, setType] = useState("text");
  const [required, setRequired] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function handleClose() {
    onClose();
    setTimeout(() => {
      setLabel("");
      setType("text");
      setRequired(false);
      setError("");
    }, 0);
  }

  async function submit(e) {
    e.preventDefault();
    setError("");
    if (!label.trim()) return setError("Enter a field name.");

    setBusy(true);
    try {
      const field = await createCustomField({ gymId, label: label.trim(), type, required });
      onCreated(field);
      handleClose();
    } catch {
      setError("Couldn't create the field.");
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={handleClose} title="Add a registration field">
      <form onSubmit={submit}>
        <div className="row2">
          <label className="field">
            <span>Field name</span>
            <input value={label} onChange={(e) => setLabel(e.target.value)} required autoFocus />
          </label>
          <label className="field">
            <span>Type</span>
            <select value={type} onChange={(e) => setType(e.target.value)}>
              {FIELD_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="checkbox-row">
          <input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} />
          Required to complete registration
        </label>

        {error && <div className="form-error">{error}</div>}

        <div className="form-actions">
          <button className="btn btn--primary btn--inline" type="submit" disabled={busy}>
            {busy ? "Creating…" : "Add field"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function CustomFieldRow({
  index,
  field,
  busy,
  setBusy,
  setError,
  editing,
  onEdit,
  onCancelEdit,
  onToggleRetire,
  onDelete,
  onSaved,
}) {
  const [label, setLabel] = useState(field.label);
  const [type, setType] = useState(field.type);
  const [required, setRequired] = useState(field.required);

  async function save() {
    setBusy(true);
    setError("");
    try {
      await updateCustomField(field.id, { label, type, required });
      onSaved({ id: field.id, label: String(label).trim(), type, required });
      onCancelEdit();
    } catch {
      setError("Couldn't save changes.");
    } finally {
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <tr>
        <td className="muted">{index + 1}</td>
        <td>
          <input value={label} onChange={(e) => setLabel(e.target.value)} />
        </td>
        <td>
          <select value={type} onChange={(e) => setType(e.target.value)}>
            {FIELD_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </td>
        <td>
          <input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} />
        </td>
        <td>
          <StatusBadge active={field.active} activeLabel="Active" inactiveLabel="Retired" />
        </td>
        <td>
          <button className="btn btn--inline" onClick={save} disabled={busy}>
            Save
          </button>{" "}
          <button className="btn btn--inline" onClick={onCancelEdit} disabled={busy}>
            Cancel
          </button>
        </td>
      </tr>
    );
  }

  return (
    <tr>
      <td className="muted">{index + 1}</td>
      <td>{field.label}</td>
      <td>{FIELD_TYPE_LABEL[field.type] || field.type}</td>
      <td>{field.required ? "Yes" : "No"}</td>
      <td>
        <StatusBadge active={field.active} activeLabel="Active" inactiveLabel="Retired" />
      </td>
      <td>
        <button className="btn btn--inline" onClick={onEdit} disabled={busy}>
          Edit
        </button>{" "}
        <button className="btn btn--inline" onClick={onToggleRetire} disabled={busy}>
          {field.active ? "Retire" : "Reactivate"}
        </button>{" "}
        <button className="btn btn--inline" onClick={onDelete} disabled={busy}>
          Delete
        </button>
      </td>
    </tr>
  );
}
