import { useEffect, useState } from "react";
import {
  listPlatformPlans,
  createPlatformPlan,
  updatePlatformPlan,
  retirePlatformPlan,
  reactivatePlatformPlan,
  getPlatformSettings,
  setAffiliateCommissionPercent,
} from "../../data";
import Modal from "../../components/Modal";
import StatusBadge from "../../components/StatusBadge";
import ChangePasswordForm from "../../components/ChangePasswordForm";
import { naira } from "../../lib/helpers";

export default function Settings() {
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [commissionPercent, setCommissionPercent] = useState(0);
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    listPlatformPlans()
      .then((p) => alive && setPlans(p))
      .catch(() => alive && setLoadError("Couldn't load pricing plans."))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    getPlatformSettings()
      .then((settings) => alive && setCommissionPercent(Number(settings.affiliate_commission_percent) || 0))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  function addPlan(plan) {
    setPlans((prev) => [...prev, plan].sort((a, b) => a.amount - b.amount));
  }

  function patchPlan(planId, patch) {
    setPlans((prev) => prev.map((p) => (p.id === planId ? { ...p, ...patch } : p)));
  }

  if (loading) return <p className="empty">Loading…</p>;
  if (loadError) return <p className="form-error">{loadError}</p>;

  return (
    <>
      <PlanManager plans={plans} onCreated={addPlan} onChanged={patchPlan} />
      <CommissionSettings percent={commissionPercent} onChanged={setCommissionPercent} />

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

// Turns a billing cycle into the same short suffix the public Pricing page
// shows — kept in sync with that file's own periodLabel() by definition,
// since duration_days is the one field both read.
function periodLabel(days) {
  if (days === 30) return "/mo";
  if (days === 365) return "/yr";
  if (days === 7) return "/wk";
  if (days === 90) return "/qtr";
  return `/${days}d`;
}

function capacityCell(count) {
  return count == null ? "Unlimited" : count.toLocaleString("en-NG");
}

// One plan, two audiences: what a GYM pays the platform (picked in
// Subscriptions when extending a subscription) AND the public Pricing
// page's cards (src/features/website/Pricing.jsx reads these same `active`
// plans directly) — see platformPlans.js's own header for why these were
// never allowed to be two separate objects. max_members/max_receptionists
// are informational everywhere right now — no gym is actually blocked from
// exceeding them yet.
function PlanManager({ plans, onCreated, onChanged }) {
  const [modalOpen, setModalOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function openCreate() {
    setEditingPlan(null);
    setError("");
    setModalOpen(true);
  }

  function openEdit(plan) {
    setEditingPlan(plan);
    setError("");
    setModalOpen(true);
  }

  async function save(fields) {
    setBusy(true);
    setError("");
    // fields uses the createPlatformPlan/updatePlatformPlan camelCase param
    // names (maxMembers, durationDays, featuresIntro) — the plan objects
    // held in state use the actual Firestore field names (max_members,
    // duration_days, features_intro), so the local optimistic patch needs
    // its own mapping rather than reusing `fields` directly.
    const patch = {
      name: fields.name,
      amount: fields.amount,
      duration_days: fields.durationDays,
      max_members: fields.maxMembers,
      max_receptionists: fields.maxReceptionists,
      max_branches: fields.maxBranches,
      blurb: fields.blurb,
      cta: fields.cta,
      featured: fields.featured,
      features_intro: fields.featuresIntro,
      features: fields.features,
    };
    try {
      if (editingPlan) {
        const others = fields.featured
          ? plans.filter((p) => p.id !== editingPlan.id && p.featured)
          : [];
        await Promise.all(others.map((p) => updatePlatformPlan(p.id, { featured: false })));
        others.forEach((p) => onChanged(p.id, { featured: false }));
        await updatePlatformPlan(editingPlan.id, fields);
        onChanged(editingPlan.id, patch);
      } else {
        if (fields.featured) {
          const others = plans.filter((p) => p.featured);
          await Promise.all(others.map((p) => updatePlatformPlan(p.id, { featured: false })));
          others.forEach((p) => onChanged(p.id, { featured: false }));
        }
        const plan = await createPlatformPlan(fields);
        onCreated(plan);
      }
      setModalOpen(false);
    } catch {
      setError(`Couldn't save this plan.`);
    } finally {
      setBusy(false);
    }
  }

  async function toggleRetire(plan) {
    setBusy(true);
    try {
      if (plan.active) await retirePlatformPlan(plan.id);
      else await reactivatePlatformPlan(plan.id);
      onChanged(plan.id, { active: !plan.active });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <div className="status-block__head">
        <h2>Pricing plans</h2>
        <button className="btn btn--inline" onClick={openCreate}>
          Create a plan
        </button>
      </div>
      <p className="muted hint">
        What a GYM pays the platform — pick one when extending a gym's subscription (in Subscriptions) to log
        revenue automatically. These same active plans are what show up as pricing cards on the public website.
      </p>

      {plans.length === 0 ? (
        <p className="empty">No pricing plans yet — the public Pricing page is showing a loading placeholder.</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>#</th>
              <th>Name</th>
              <th>Price</th>
              <th>Branches</th>
              <th>Members</th>
              <th>Receptionists</th>
              <th>Featured</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {plans.map((p, i) => (
              <tr key={p.id}>
                <td className="muted">{i + 1}</td>
                <td>{p.name}</td>
                <td>{naira(p.amount)}{periodLabel(p.duration_days)}</td>
                <td className="muted">{capacityCell(p.max_branches)}</td>
                <td className="muted">{capacityCell(p.max_members)}</td>
                <td className="muted">{capacityCell(p.max_receptionists)}</td>
                <td>{p.featured ? <StatusBadge active activeLabel="Featured" /> : <span className="muted">—</span>}</td>
                <td>
                  <StatusBadge active={p.active} activeLabel="Active" inactiveLabel="Retired" />
                </td>
                <td>
                  <button className="btn btn--inline" onClick={() => openEdit(p)} disabled={busy}>Edit</button>{" "}
                  <button className="btn btn--inline" onClick={() => toggleRetire(p)} disabled={busy}>
                    {p.active ? "Retire" : "Reactivate"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {error && <div className="form-error">{error}</div>}

      <PlanModal open={modalOpen} onClose={() => setModalOpen(false)} onSave={save} busy={busy} plan={editingPlan} />
    </div>
  );
}

function PlanModal({ open, onClose, onSave, busy, plan }) {
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [durationDays, setDurationDays] = useState("30");
  const [maxMembers, setMaxMembers] = useState("");
  const [maxReceptionists, setMaxReceptionists] = useState("");
  const [maxBranches, setMaxBranches] = useState("");
  const [blurb, setBlurb] = useState("");
  const [cta, setCta] = useState("Get started");
  const [featuresIntro, setFeaturesIntro] = useState("");
  const [featuresText, setFeaturesText] = useState("");
  const [featured, setFeatured] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setName(plan?.name ?? "");
    setAmount(plan?.amount != null ? String(plan.amount) : "");
    setDurationDays(plan?.duration_days != null ? String(plan.duration_days) : "30");
    setMaxMembers(plan?.max_members != null ? String(plan.max_members) : "");
    setMaxReceptionists(plan?.max_receptionists != null ? String(plan.max_receptionists) : "");
    setMaxBranches(plan?.max_branches != null ? String(plan.max_branches) : "");
    setBlurb(plan?.blurb ?? "");
    setCta(plan?.cta ?? "Get started");
    setFeaturesIntro(plan?.features_intro ?? "");
    setFeaturesText((plan?.features ?? []).join("\n"));
    setFeatured(plan?.featured ?? false);
    setError("");
  }, [open, plan]);

  function submit(e) {
    e.preventDefault();
    setError("");
    if (!name.trim()) return setError("Enter a plan name.");
    if (!amount || Number(amount) <= 0) return setError("Enter an amount.");
    if (!durationDays || Number(durationDays) <= 0) return setError("Enter a duration in days.");
    if (!cta.trim()) return setError("Enter button text.");

    onSave({
      name: name.trim(),
      amount: Number(amount),
      durationDays: Number(durationDays),
      maxMembers: maxMembers.trim() === "" ? null : Number(maxMembers),
      maxReceptionists: maxReceptionists.trim() === "" ? null : Number(maxReceptionists),
      maxBranches: maxBranches.trim() === "" ? null : Number(maxBranches),
      blurb: blurb.trim(),
      cta: cta.trim(),
      featuresIntro: featuresIntro.trim(),
      features: featuresText.split("\n").map((f) => f.trim()).filter(Boolean),
      featured,
    });
  }

  return (
    <Modal open={open} onClose={onClose} title={plan ? "Edit plan" : "Create a plan"}>
      <form onSubmit={submit}>
        <div className="row2">
          <label className="field">
            <span>Name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
          </label>
          <label className="field">
            <span>Amount (₦)</span>
            <input type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} required />
          </label>
        </div>
        <label className="field">
          <span>Duration (days)</span>
          <input type="number" min="1" value={durationDays} onChange={(e) => setDurationDays(e.target.value)} required />
        </label>

        {/* .row2, not .row2--even: the Name/Amount row above is 2fr 1fr, so
            an even split here would give this modal's right-hand column two
            different left edges. One ratio throughout keeps the narrow
            fields (Amount, Max receptionists) on a single line down the
            form — the same reason NewGym.jsx's address row is plain .row2. */}
        <div className="row2 section-top">
          <label className="field">
            <span>Max branches</span>
            <input type="number" min="0" value={maxBranches} onChange={(e) => setMaxBranches(e.target.value)} />
          </label>
          <label className="field">
            <span>Max receptionists</span>
            <input type="number" min="0" value={maxReceptionists} onChange={(e) => setMaxReceptionists(e.target.value)} />
          </label>
        </div>
        <label className="field">
          <span>Max members</span>
          <input type="number" min="0" value={maxMembers} onChange={(e) => setMaxMembers(e.target.value)} />
        </label>
        <p className="muted hint">
          Leave any of the three blank for unlimited. Internal only — used for the "over limit" flags on a
          gym's admin page, not shown on the public pricing page, and not enforced anywhere in the app yet — a
          gym can still exceed this without being blocked. To advertise a limit to prospects (e.g. "Up to 300
          members" or "10+ receptionists"), type it into "Extra features" below in your own words.
        </p>

        <label className="field section-top">
          <span>Blurb (public pricing page)</span>
          <input value={blurb} onChange={(e) => setBlurb(e.target.value)} placeholder="One line describing this plan" />
        </label>
        <label className="field">
          <span>Button text (public pricing page)</span>
          <input value={cta} onChange={(e) => setCta(e.target.value)} required />
        </label>
        <label className="checkbox-row">
          <input type="checkbox" checked={featured} onChange={(e) => setFeatured(e.target.checked)} />
          Show as "Most popular"
        </label>
        <label className="field">
          <span>Features intro (optional)</span>
          <input value={featuresIntro} onChange={(e) => setFeaturesIntro(e.target.value)} placeholder="Everything in Starter, plus:" />
        </label>
        <label className="field">
          <span>Features (one per line — this is everything the pricing page shows)</span>
          <textarea
            rows={6}
            value={featuresText}
            onChange={(e) => setFeaturesText(e.target.value)}
            placeholder={"Up to 300 members\n2 receptionists\n1 branch\n1 owner account"}
          />
        </label>

        {error && <div className="form-error">{error}</div>}

        <div className="form-actions">
          <button className="btn btn--primary btn--inline" type="submit" disabled={busy}>
            {busy ? "Saving…" : plan ? "Save changes" : "Create plan"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// The cut an affiliate marketer earns on a gym's platform payment (only for
// gyms with one attached at registration — see NewGym.jsx) — everything
// else stays with the platform. Read by Subscriptions.jsx at the moment a
// payment is recorded and frozen onto that earning, so a later change here
// never rewrites money already earned. Marketer roster + payouts live under
// their own "Marketers" nav section, not here.
function CommissionSettings({ percent, onChanged }) {
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <div className="card">
      <div className="status-block__head">
        <h2>Affiliate commission</h2>
        <button className="btn btn--inline" onClick={() => setModalOpen(true)}>
          Edit
        </button>
      </div>
      <p className="muted hint">
        The share of a gym's platform payment that goes to the affiliate marketer who brought them in.
        Gyms with no affiliate attached keep 100% of their payment with the platform.
      </p>
      <p className="stat-card__value">{percent}%</p>

      <EditCommissionModal open={modalOpen} onClose={() => setModalOpen(false)} percent={percent} onChanged={onChanged} />
    </div>
  );
}

function EditCommissionModal({ open, onClose, percent, onChanged }) {
  const [value, setValue] = useState(String(percent));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setValue(String(percent));
      setError("");
    }
  }, [open, percent]);

  async function submit(e) {
    e.preventDefault();
    setError("");
    const num = Number(value);
    if (Number.isNaN(num) || num < 0 || num > 100) return setError("Enter a percentage between 0 and 100.");

    setBusy(true);
    try {
      await setAffiliateCommissionPercent(num);
      onChanged(num);
      onClose();
    } catch {
      setError("Couldn't save the commission rate.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Affiliate commission">
      <form onSubmit={submit}>
        <label className="field">
          <span>Commission (%)</span>
          <input
            type="number"
            min="0"
            max="100"
            step="0.5"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            required
            autoFocus
          />
        </label>

        {error && <div className="form-error">{error}</div>}

        <div className="form-actions">
          <button className="btn btn--primary btn--inline" type="submit" disabled={busy}>
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
