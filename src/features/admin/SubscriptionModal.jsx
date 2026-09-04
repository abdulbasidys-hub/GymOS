import { useEffect, useState } from "react";
import { useAuth } from "../../auth";
import {
  listPlatformPlans,
  getPlatformSettings,
  setOwnerSubscription,
  lockOwnerSubscription,
  unlockOwnerSubscription,
  createPlatformPayment,
  recordAffiliateEarning,
  logAdminActivity,
} from "../../data";
import Modal from "../../components/Modal";
import { licenseStatus, daysRemaining } from "../../logic/license";
import { formatDate, formatDateTime, naira, toDate, capitalize } from "../../lib/helpers";

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function toDateInputValue(value) {
  const d = toDate(value);
  if (!d) return "";
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

// Extend an OWNER's pooled subscription (BUILD.md §6/§13 — covers every
// branch they manage, not one gym) against one of the platform's plans
// (which also logs revenue + affiliate commission), set a custom expiry
// with no revenue logged, or instant-lock/unlock it. `primaryGym` is only
// used for affiliate attribution (decided once, at the owner's original
// signup — BUILD.md §6 — never re-evaluated as branches are added).
// Reached from OwnerDetailPage.jsx and Subscriptions.jsx, so it owns its
// own plans/commission fetch rather than depending on either page's state.
export default function SubscriptionModal({ owner, primaryGym, open, onClose, onOwnerChange }) {
  const { account } = useAuth();
  const [plans, setPlans] = useState([]);
  const [commissionPercent, setCommissionPercent] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [selectedPlanId, setSelectedPlanId] = useState("custom");
  const [expiryInput, setExpiryInput] = useState("");

  useEffect(() => {
    if (!open) return;
    let alive = true;
    Promise.all([listPlatformPlans(), getPlatformSettings()])
      .then(([p, settings]) => {
        if (!alive) return;
        const active = p.filter((x) => x.active);
        setPlans(active);
        setSelectedPlanId(active[0]?.id ?? "custom");
        setCommissionPercent(Number(settings.affiliate_commission_percent) || 0);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [open]);

  useEffect(() => {
    setExpiryInput(toDateInputValue(owner?.subscription?.expiry_date));
    setError("");
  }, [owner]);

  const gymIds = owner?.gym_ids ?? (owner?.gym_id ? [owner.gym_id] : []);
  const selectedPlan = plans.find((p) => p.id === selectedPlanId);
  const status = owner ? licenseStatus({ status: "active", subscription: owner.subscription }) : null;
  const remaining = owner ? daysRemaining(owner.subscription?.expiry_date) : null;

  async function submitCustomExpiry(e) {
    e.preventDefault();
    setError("");
    if (!expiryInput) return setError("Pick an expiry date.");
    setBusy(true);
    try {
      const expiryDate = new Date(`${expiryInput}T23:59:59`);
      await setOwnerSubscription(owner.id, gymIds, { expiryDate });
      await logAdminActivity({
        gymId: owner.gym_id,
        gymName: `${owner.name}'s account`,
        activity: "Subscription renewed",
        status: "active",
        performedBy: account?.name,
      });
      onOwnerChange({ subscription: { ...owner.subscription, expiry_date: expiryDate, grace_hours: 24, locked: false } });
    } catch {
      setError("Couldn't update the subscription.");
    } finally {
      setBusy(false);
    }
  }

  async function extendWithPlan() {
    if (!selectedPlan) return;
    setBusy(true);
    setError("");
    try {
      const currentExpiry = toDate(owner.subscription?.expiry_date);
      const base = currentExpiry && currentExpiry.getTime() > Date.now() ? currentExpiry : new Date();
      const expiryDate = addDays(base, selectedPlan.duration_days);
      await setOwnerSubscription(owner.id, gymIds, { expiryDate, planId: selectedPlan.id, planName: selectedPlan.name });
      const payment = await createPlatformPayment({
        ownerUid: owner.id,
        ownerName: owner.name,
        planId: selectedPlan.id,
        planName: selectedPlan.name,
        amount: selectedPlan.amount,
        durationDays: selectedPlan.duration_days,
      });
      // Affiliate attribution is decided once, at the owner's ORIGINAL
      // signup (primaryGym's own affiliate_id) — never re-evaluated per
      // branch or per payment (BUILD.md §6). A branch added later via the
      // "existing owner" flow never carries its own attribution.
      if (primaryGym?.affiliate_id && commissionPercent > 0) {
        await recordAffiliateEarning({
          affiliateId: primaryGym.affiliate_id,
          affiliateName: primaryGym.affiliate_name,
          gymId: owner.gym_id,
          gymName: primaryGym.name,
          platformPaymentId: payment.id,
          paymentAmount: selectedPlan.amount,
          commissionPercent,
        });
      }
      await logAdminActivity({
        gymId: owner.gym_id,
        gymName: `${owner.name}'s account`,
        activity: "Subscription renewed",
        status: "active",
        performedBy: account?.name,
      });
      onOwnerChange({
        subscription: {
          ...owner.subscription,
          expiry_date: expiryDate,
          grace_hours: 24,
          locked: false,
          plan_id: selectedPlan.id,
          plan_name: selectedPlan.name,
        },
      });
      setExpiryInput(toDateInputValue(expiryDate));
    } catch {
      setError("Couldn't extend the subscription.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleLock() {
    setBusy(true);
    setError("");
    try {
      const locked = !owner.subscription?.locked;
      if (locked) await lockOwnerSubscription(owner.id, gymIds);
      else await unlockOwnerSubscription(owner.id, gymIds);
      await logAdminActivity({
        gymId: owner.gym_id,
        gymName: `${owner.name}'s account`,
        activity: locked ? "Subscription locked" : "Subscription unlocked",
        status: locked ? "locked" : "active",
        performedBy: account?.name,
      });
      onOwnerChange({ subscription: { ...owner.subscription, locked } });
    } catch {
      setError("Couldn't update the lock.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={owner ? `Manage billing — ${owner.name}` : "Manage billing"}>
      {owner && (
        <div>
          <p className="muted hint">
            One subscription covers every branch this owner manages ({gymIds.length} branch{gymIds.length === 1 ? "" : "es"}).
          </p>
          <div className="detail-grid">
            <div>
              <h4>Status</h4>
              <p>
                <strong className={`status-text status-text--${status}`}>{capitalize(status)}</strong>
              </p>
            </div>
            <div>
              <h4>Plan</h4>
              <p>{owner.subscription?.plan_name || <span className="muted">—</span>}</p>
            </div>
            <div>
              <h4>Expires</h4>
              <p className="muted">
                {owner.subscription?.expiry_date ? formatDate(owner.subscription.expiry_date) : "Not set"}
                {remaining != null &&
                  ` · ${remaining >= 0 ? `${remaining}d left` : `${Math.abs(remaining)}d overdue`}`}
              </p>
            </div>
            <div>
              <h4>Grace / last check</h4>
              <p className="muted">
                {owner.subscription?.grace_hours ?? 24}h · {formatDateTime(owner.subscription?.last_verified_at)}
              </p>
            </div>
          </div>

          <div className="section-top">
            {plans.length > 0 && (
              <label className="field">
                <span>Plan</span>
                <select value={selectedPlanId} onChange={(e) => setSelectedPlanId(e.target.value)}>
                  {plans.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} — {naira(p.amount)} / {p.duration_days} days
                      {p.max_branches != null ? ` (up to ${p.max_branches} branches)` : ""}
                    </option>
                  ))}
                  <option value="custom">Custom date (no revenue logged)</option>
                </select>
              </label>
            )}

            {selectedPlanId !== "custom" && selectedPlan ? (
              <div className="form-actions">
                <button className="btn btn--inline btn--primary" onClick={extendWithPlan} disabled={busy}>
                  {busy ? "Extending…" : `Extend by ${selectedPlan.duration_days} days — ${naira(selectedPlan.amount)}`}
                </button>
              </div>
            ) : (
              <form onSubmit={submitCustomExpiry}>
                <div className="row2">
                  <label className="field">
                    <span>Expiry date</span>
                    <input type="date" value={expiryInput} onChange={(e) => setExpiryInput(e.target.value)} />
                  </label>
                  <div className="form-actions">
                    <button className="btn btn--inline btn--primary" type="submit" disabled={busy}>
                      Set / extend
                    </button>
                  </div>
                </div>
              </form>
            )}

            <div className="form-actions">
              <button className="btn btn--inline" onClick={toggleLock} disabled={busy}>
                {owner.subscription?.locked ? "Unlock" : "Instant-lock"}
              </button>
            </div>

            {error && <div className="form-error">{error}</div>}
          </div>
        </div>
      )}
    </Modal>
  );
}
