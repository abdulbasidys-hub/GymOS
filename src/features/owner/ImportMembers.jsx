import { useEffect, useState } from "react";
import { useAuth } from "../../auth";
import {
  listPlans,
  createMember,
  createMembershipRecord,
  createEquipmentRecord,
  logActivity,
} from "../../data";
import { computeExpiry } from "../../logic/expiry";
import { formatDate } from "../../lib/helpers";

// Bringing an existing gym's members across at onboarding.
//
// A gym that already has 300 members on paper cannot start using GymOS until
// those members exist in it — but they paid that gym months ago, in cash, at
// a desk that had nothing to do with us. Putting them through the normal
// registration form would post 300 payments dated today, and the owner's
// Finances page would open on a month of revenue that never happened.
//
// So this page writes NO payment. It creates the member and their membership
// record directly, with the dates they actually started on. The member ends
// up indistinguishable from one who has been renewing here for a year, which
// is the point: from tomorrow the desk treats them like anybody else.
//
// The trade is deliberate and worth stating: a membership_record here has
// payment_id: null, so a membership exists that no money in this system
// explains. That is the honest shape of the fact — the money is real, it just
// predates us. `imported: true` marks it as such rather than leaving a future
// reader to guess why the payment is missing.
//
// Owner-only, on purpose. This is setup-day work, done once, with the owner
// sitting there reading off their own book; it is not a thing a receptionist
// should be able to reach mid-shift, because "register a member without
// taking their money" is exactly the shape of a way to let a friend in free.
export default function ImportMembers() {
  const { gymId, gym, account } = useAuth();
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [added, setAdded] = useState([]);

  const [form, setForm] = useState({
    name: "",
    phone: "",
    address: "",
    gender: "",
    dob: "",
    email: "",
    weight: "",
    height: "",
    emergencyName: "",
    emergencyPhone: "",
  });
  const [membershipPlanId, setMembershipPlanId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [wantsEquipment, setWantsEquipment] = useState(false);
  const [equipmentPlanId, setEquipmentPlanId] = useState("");

  useEffect(() => {
    let alive = true;
    listPlans(gymId)
      .then((p) => alive && setPlans(p.filter((x) => x.active !== false)))
      .catch(() => alive && setError("Couldn't load your plans."))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [gymId]);

  const membershipPlans = plans.filter((p) => p.type === "membership");
  const equipmentPlans = plans.filter((p) => p.type === "equipment");
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const membershipPlan = membershipPlans.find((p) => p.id === membershipPlanId);
  // Shown live, because "when does this one run out?" is the question the
  // owner is actually answering from their book, and getting it wrong is the
  // whole risk of this screen.
  const previewExpiry =
    membershipPlan && startDate
      ? computeExpiry(new Date(startDate), membershipPlan.duration_count, membershipPlan.duration_unit)
      : null;

  async function submit(e) {
    e.preventDefault();
    setError("");
    if (!form.name.trim()) return setError("Enter the member's name.");
    if (!form.phone.trim()) return setError("Enter a phone number.");
    if (!form.address.trim()) return setError("Enter an address.");
    if (!membershipPlanId) return setError("Pick the plan they are already on.");
    if (!startDate) return setError("Enter the date their current plan started.");
    if (wantsEquipment && !equipmentPlanId) return setError("Pick an equipment plan, or untick the box.");

    const start = new Date(startDate);
    if (Number.isNaN(start.getTime())) return setError("That start date isn't a real date.");
    if (start.getTime() > Date.now()) return setError("The start date is in the future — this page is for members who already joined.");

    setBusy(true);
    try {
      const member = await createMember({
        gymId,
        gymPrefix: gym.prefix,
        name: form.name,
        phone: form.phone,
        address: form.address,
        gender: form.gender || undefined,
        dob: form.dob || undefined,
        email: form.email || undefined,
        weight: form.weight || undefined,
        height: form.height || undefined,
        emergencyName: form.emergencyName || undefined,
        emergencyPhone: form.emergencyPhone || undefined,
      });

      // NO createPayment. That is the entire difference between this page and
      // the desk's registration form.
      await createMembershipRecord({
        gymId,
        memberId: member.id,
        planId: membershipPlan.id,
        planName: membershipPlan.name,
        startDate: start,
        expiryDate: computeExpiry(start, membershipPlan.duration_count, membershipPlan.duration_unit),
        paymentId: null,
        imported: true,
      });

      if (wantsEquipment) {
        const equipmentPlan = equipmentPlans.find((p) => p.id === equipmentPlanId);
        // An equipment RECORD, not a pending payment: an existing member is
        // already using the machines, so their clock is already running.
        // Waiting for a first check-in here would lock out somebody who has
        // been training for months.
        await createEquipmentRecord({
          gymId,
          memberId: member.id,
          planId: equipmentPlan.id,
          planName: equipmentPlan.name,
          startDate: start,
          expiryDate: computeExpiry(start, equipmentPlan.duration_count, equipmentPlan.duration_unit),
          paymentId: null,
          imported: true,
        });
      }

      await logActivity({
        gymId,
        action: "Imported existing member",
        target: `${member.name} (${member.member_no})`,
        performedBy: account?.name,
      });

      setAdded((prev) => [{ ...member, planName: membershipPlan.name }, ...prev]);
      // Keep the plan, the date and the equipment choice: a whole book of
      // members is usually on the same plan and the same start month, and
      // re-picking them 300 times is how this page would get abandoned.
      setForm({
        name: "",
        phone: "",
        address: "",
        gender: "",
        dob: "",
        email: "",
        weight: "",
        height: "",
        emergencyName: "",
        emergencyPhone: "",
      });
    } catch (err) {
      console.error(err);
      setError("Couldn't add that member. Nothing was saved — try again.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <p className="empty">Loading…</p>;

  return (
    <>
      <div className="page-header">
        <h1>Add existing members</h1>
        <p>For members who already belong to this gym. Nothing here is recorded as money taken.</p>
      </div>

      <div className="notice">
        Use this only for people who joined <strong>before</strong> you started on GymOS. It records
        what they are already on, without adding anything to your revenue. Anybody paying you from
        now on should be registered at the front desk in the normal way, so the money is counted.
      </div>

      {membershipPlans.length === 0 ? (
        <p className="form-error">
          Set up at least one membership plan in Settings first — a member has to be on something.
        </p>
      ) : (
        <div className="card">
          <form onSubmit={submit}>
            <h2>Their details</h2>
            <div className="form-grid">
              <label className="field">
                <span>Full name</span>
                <input value={form.name} onChange={set("name")} required />
              </label>
              <label className="field">
                <span>Phone</span>
                <input value={form.phone} onChange={set("phone")} required />
              </label>
              <label className="field">
                <span>Address</span>
                <input value={form.address} onChange={set("address")} required />
              </label>
              <label className="field">
                <span>Gender (optional)</span>
                <select value={form.gender} onChange={set("gender")}>
                  <option value="">—</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                </select>
              </label>
              <label className="field">
                <span>Date of birth (optional)</span>
                <input type="date" value={form.dob} onChange={set("dob")} />
              </label>
              <label className="field">
                <span>Email (optional)</span>
                <input type="email" value={form.email} onChange={set("email")} />
              </label>
              <label className="field">
                <span>Emergency contact (optional)</span>
                <input value={form.emergencyName} onChange={set("emergencyName")} />
              </label>
              <label className="field">
                <span>Emergency phone (optional)</span>
                <input value={form.emergencyPhone} onChange={set("emergencyPhone")} />
              </label>
            </div>

            <h2 className="section-top">What they are already on</h2>
            <div className="form-grid">
              <label className="field">
                <span>Membership plan</span>
                <select value={membershipPlanId} onChange={(e) => setMembershipPlanId(e.target.value)} required>
                  <option value="">Pick a plan…</option>
                  {membershipPlans.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Started on</span>
                <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
                <span className="muted hint">
                  {previewExpiry
                    ? `Runs until ${formatDate(previewExpiry)}.`
                    : "The date this plan began, from your own records."}
                </span>
              </label>
            </div>

            {equipmentPlans.length > 0 && (
              <>
                <label className="field field--check">
                  <input
                    type="checkbox"
                    checked={wantsEquipment}
                    onChange={(e) => setWantsEquipment(e.target.checked)}
                  />
                  <span>They are also on an equipment plan</span>
                </label>
                {wantsEquipment && (
                  <label className="field">
                    <span>Equipment plan</span>
                    <select value={equipmentPlanId} onChange={(e) => setEquipmentPlanId(e.target.value)}>
                      <option value="">Pick a plan…</option>
                      {equipmentPlans.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                    <span className="muted hint">
                      Counted from the same start date — they are already using the machines, so the
                      clock is already running.
                    </span>
                  </label>
                )}
              </>
            )}

            {error && <div className="form-error">{error}</div>}

            <div className="form-actions">
              <button className="btn btn--primary btn--inline" type="submit" disabled={busy}>
                {busy ? "Adding…" : "Add member"}
              </button>
            </div>
          </form>
        </div>
      )}

      {added.length > 0 && (
        <div className="card">
          <div className="status-block__head">
            <h2>Added in this session</h2>
            <span className="pill">{added.length}</span>
          </div>
          <p className="muted hint">
            The plan and start date stay filled in between members, so a whole book on the same plan
            goes in quickly.
          </p>
          <table className="table">
            <thead>
              <tr>
                <th>#</th>
                <th>Member no.</th>
                <th>Name</th>
                <th>Plan</th>
              </tr>
            </thead>
            <tbody>
              {added.map((m, i) => (
                <tr key={m.id}>
                  <td className="muted">{added.length - i}</td>
                  <td>{m.member_no}</td>
                  <td>{m.name}</td>
                  <td className="muted">{m.planName}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
