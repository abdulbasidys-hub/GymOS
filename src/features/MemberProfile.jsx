import { useCallback, useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../auth";
import {
  getMember,
  updateMember,
  listMembershipRecords,
  listEquipmentRecords,
  listPaymentsByMember,
  listAttendanceByMember,
  listPlans,
  listCustomFields,
  createPayment,
  createMembershipRecord,
  createEquipmentRecord,
  recordAttendance,
  logActivity,
  uploadMemberPhoto,
} from "../data";
import { currentRecord, isActive, computeExpiry } from "../logic/expiry";
import { verdict as computeVerdict } from "../logic/entry";
import EntryVerdict from "../components/EntryVerdict";
import StatusBadge from "../components/StatusBadge";
import HistoryList from "../components/HistoryList";
import PlanPicker from "../components/PlanPicker";
import PhoneNumber from "../components/PhoneNumber";
import { formatMoney, formatDate, formatDateTime, toDate, startOfDay, capitalize } from "../lib/helpers";
import { resolveMemberPhotoSrc } from "../data/local/photoCache";

// Identical for receptionist and owner (BUILD.md §8): full identity, status,
// and history. Only the desk role gets the interactive renew/pay controls
// and the "Record attendance" button — owners have R-only on members/
// payments/attendance per the permission table (§7).
export default function MemberProfile() {
  const { memberId } = useParams();
  const navigate = useNavigate();
  const { role, gymId, gym } = useAuth();
  const isDesk = role === "receptionist";

  const [member, setMember] = useState(null);
  // The photo's real <img src>. On the web this is just member.photo_url,
  // but under Electron it resolves to the locally cached copy of the file
  // so the face still shows with no connection. Async (it reads the local
  // database), hence state rather than a value computed during render.
  const [photoSrc, setPhotoSrc] = useState(null);
  const [membershipRecords, setMembershipRecords] = useState([]);
  const [equipmentRecords, setEquipmentRecords] = useState([]);
  const [payments, setPayments] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [plans, setPlans] = useState([]);
  const [customFieldDefs, setCustomFieldDefs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("payments");
  const [busy, setBusy] = useState(false);

  // Bio-data edit (BUILD.md §15) — desk only, matching this file's own
  // existing "owners have R-only on members" note above; never touches
  // anything transactional (payments/membership/attendance stay
  // append-only, untouched by editForm entirely).
  const [editingDetails, setEditingDetails] = useState(false);
  const [editForm, setEditForm] = useState(null);

  // Photo — same "never required, always addable later" rule as
  // registration (RegisterMember.jsx). Desk-only, mirroring every other
  // interactive control on this page (owners stay read-only on members).
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState("");

  async function handlePhotoChange(e) {
    const file = e.target.files?.[0];
    e.target.value = ""; // let the same file be re-picked later if needed
    if (!file) return;
    setPhotoBusy(true);
    setPhotoError("");
    try {
      const url = await uploadMemberPhoto(gymId, member.id, file);
      setMember((m) => ({ ...m, photo_url: url }));
    } catch (err) {
      setPhotoError(err?.message || "Couldn't upload this photo.");
    } finally {
      setPhotoBusy(false);
    }
  }

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [m, mr, er, p, a, pl, cf] = await Promise.all([
        getMember(memberId),
        listMembershipRecords(gymId, memberId),
        listEquipmentRecords(gymId, memberId),
        listPaymentsByMember(gymId, memberId),
        listAttendanceByMember(gymId, memberId),
        listPlans(gymId),
        listCustomFields(gymId),
      ]);
      setMember(m);
      setMembershipRecords(mr);
      setEquipmentRecords(er);
      setPayments(p);
      setAttendance(a);
      setPlans(pl);
      setCustomFieldDefs(cf);
    } catch (err) {
      console.error(err);
      setError("Couldn't load this member.");
    } finally {
      setLoading(false);
    }
  }, [memberId, gymId]);

  useEffect(() => {
    load();
  }, [load]);

  // Re-resolves whenever the member's photo_url changes — which covers the
  // upload flow above, since it sets photo_url on success. `alive` guards
  // against a resolution landing after the user has navigated to a
  // different member.
  useEffect(() => {
    if (!member) {
      setPhotoSrc(null);
      return;
    }
    let alive = true;
    resolveMemberPhotoSrc(member).then((src) => {
      if (alive) setPhotoSrc(src);
    });
    return () => {
      alive = false;
    };
  }, [member?.id, member?.photo_url]);

  if (loading) return <p className="empty">Loading…</p>;
  if (error && !member) return <p className="form-error">{error}</p>;
  if (!member) return <p className="empty">Member not found.</p>;

  const currentMembership = currentRecord(membershipRecords);
  const currentEquipment = currentRecord(equipmentRecords);
  const membershipActive = isActive(currentMembership?.expiry_date);
  const equipmentActive = isActive(currentEquipment?.expiry_date);
  const v = computeVerdict({ membershipActive, equipmentActive });

  // An equipment payment with no matching equipment_record yet — paid for,
  // but access doesn't start counting down until they actually show up (see
  // handleAttendance, and data/payments.js's note on why duration is frozen
  // onto the payment itself).
  const activatedPaymentIds = new Set(equipmentRecords.map((r) => r.payment_id));
  const pendingEquipmentPayment =
    [...payments]
      .filter((p) => p.for === "equipment" && !activatedPaymentIds.has(p.id))
      .sort((a, b) => (toDate(b.paid_at)?.getTime() ?? 0) - (toDate(a.paid_at)?.getTime() ?? 0))[0] || null;

  const todayStart = startOfDay(new Date()).getTime();
  const attendedToday = attendance.some((a) => (toDate(a.recorded_at)?.getTime() ?? 0) >= todayStart);

  async function handlePay(type, planId) {
    const plan = plans.find((p) => p.id === planId);
    if (!plan) return;
    setBusy(true);
    setError("");
    try {
      const payment = await createPayment({
        gymId,
        memberId: member.id,
        planId: plan.id,
        planName: plan.name,
        planType: plan.type,
        amount: plan.price,
        forType: type,
        durationCount: plan.duration_count,
        durationUnit: plan.duration_unit,
      });

      if (type === "membership") {
        const startDate = new Date();
        const expiryDate = computeExpiry(startDate, plan.duration_count, plan.duration_unit);
        await createMembershipRecord({
          gymId,
          memberId: member.id,
          planId: plan.id,
          planName: plan.name,
          startDate,
          expiryDate,
          paymentId: payment.id,
        });
      }
      // Equipment doesn't get its record yet — it activates on their next
      // attendance (handleAttendance), not at the moment of payment.

      await logActivity({
        gymId,
        action: `Collected ${type} payment`,
        target: `${member.name} (${member.member_no})`,
      });
      await load();
    } catch (err) {
      console.error(err);
      setError("Couldn't record the payment.");
    } finally {
      setBusy(false);
    }
  }

  async function handleAttendance() {
    setBusy(true);
    setError("");
    try {
      const rec = await recordAttendance({ gymId, memberId: member.id });
      setAttendance((prev) => [...prev, rec]);
      await logActivity({
        gymId,
        action: "Recorded attendance",
        target: `${member.name} (${member.member_no})`,
      });

      // First attendance since an equipment payment — start the clock now.
      if (pendingEquipmentPayment) {
        const startDate = new Date();
        const expiryDate = computeExpiry(
          startDate,
          pendingEquipmentPayment.duration_count,
          pendingEquipmentPayment.duration_unit
        );
        const newRecord = await createEquipmentRecord({
          gymId,
          memberId: member.id,
          planId: pendingEquipmentPayment.plan_id,
          planName: pendingEquipmentPayment.plan_name,
          startDate,
          expiryDate,
          paymentId: pendingEquipmentPayment.id,
        });
        setEquipmentRecords((prev) => [...prev, newRecord]);
      }
    } catch {
      setError("Couldn't record attendance.");
    } finally {
      setBusy(false);
    }
  }

  function startEditingDetails() {
    setEditForm({
      name: member.name || "",
      phone: member.phone || "",
      gender: member.gender || "male",
      dob: member.dob || "",
      weight: member.weight || "",
      height: member.height || "",
      emergencyName: member.emergency_name || "",
      emergencyPhone: member.emergency_phone || "",
      address: member.address || "",
      email: member.email || "",
    });
    setError("");
    setEditingDetails(true);
  }

  async function saveDetails() {
    setBusy(true);
    setError("");
    try {
      await updateMember(member.id, editForm);
      setMember((prev) => ({
        ...prev,
        name: editForm.name.trim(),
        phone: editForm.phone.trim(),
        gender: editForm.gender,
        dob: editForm.dob || null,
        weight: editForm.weight ? Number(editForm.weight) : null,
        height: editForm.height ? Number(editForm.height) : null,
        emergency_name: editForm.emergencyName,
        emergency_phone: editForm.emergencyPhone,
        address: editForm.address,
        email: editForm.email,
      }));
      setEditingDetails(false);
    } catch (err) {
      console.error(err);
      setError("Couldn't save these changes.");
    } finally {
      setBusy(false);
    }
  }

  const customFieldEntries = Object.entries(member.custom_fields || {}).map(([fieldId, value]) => {
    const def = customFieldDefs.find((f) => f.id === fieldId);
    const label = def?.label || fieldId;
    const display = def?.type === "yesno" ? capitalize(value) : value;
    return { fieldId, label, value: display };
  });

  const sortedPayments = [...payments].sort(
    (a, b) => (toDate(b.paid_at)?.getTime() ?? 0) - (toDate(a.paid_at)?.getTime() ?? 0)
  );
  const sortedAttendance = [...attendance].sort(
    (a, b) => (toDate(b.recorded_at)?.getTime() ?? 0) - (toDate(a.recorded_at)?.getTime() ?? 0)
  );

  return (
    <div>
      <button type="button" className="back-link" onClick={() => navigate(-1)}>&larr; Back</button>

      <div className="member-id">
        <div className="member-photo">
          {photoSrc ? (
            <img src={photoSrc} alt="" className="avatar-badge avatar-badge--xl" />
          ) : (
            <span className="avatar-badge avatar-badge--xl" aria-hidden="true">
              {member.name.trim().charAt(0).toUpperCase()}
            </span>
          )}
          {isDesk && (
            <label className="member-photo__edit">
              {photoBusy ? "Uploading…" : member.photo_url ? "Change" : "Add photo"}
              <input type="file" accept="image/*" hidden onChange={handlePhotoChange} disabled={photoBusy} />
            </label>
          )}
        </div>
        <div>
          <div className="member-id__no">{member.member_no}</div>
          <h1>{member.name}</h1>
          <p className="muted"><PhoneNumber value={member.phone} /></p>
        </div>
      </div>
      {photoError && <p className="form-error">{photoError}</p>}

      <div className="card section-top">
        <h2>Membership &amp; equipment</h2>
        <div className="detail-grid detail-grid--status">
          <PlanCell
            title="Membership"
            record={currentMembership}
            active={membershipActive}
            plans={plans.filter((p) => p.type === "membership")}
            editable={isDesk}
            busy={busy}
            onPay={(planId) => handlePay("membership", planId)}
            currencyCode={gym?.currency_code}
            countryCode={gym?.country_code}
          />
          <PlanCell
            title="Equipment"
            record={currentEquipment}
            active={equipmentActive}
            pending={!!pendingEquipmentPayment}
            plans={plans.filter((p) => p.type === "equipment")}
            editable={isDesk}
            busy={busy}
            onPay={(planId) => handlePay("equipment", planId)}
            currencyCode={gym?.currency_code}
            countryCode={gym?.country_code}
          />
        </div>
      </div>

      {isDesk && (
        <>
          <EntryVerdict membershipActive={v.membershipActive} equipmentActive={v.equipmentActive} />

          <div className="form-actions">
            <button
              className="btn btn--primary btn--inline"
              onClick={handleAttendance}
              disabled={busy || !membershipActive || attendedToday}
            >
              {attendedToday ? "Already checked in today" : "Record attendance"}
            </button>{" "}
            {/* Gated on membership only, not the combined verdict — equipment
                access can legitimately be red while attendance is still
                recordable ("walking out green on membership / red on
                equipment", BUILD.md §8), and a first-time equipment payment
                specifically NEEDS attendance to be recordable, since that's
                what activates it (see handleAttendance). */}
            {!membershipActive && <span className="muted">Collect a membership payment to enable check-in.</span>}
            {membershipActive && attendedToday && (
              <span className="muted">Attendance already recorded for today — resets tomorrow.</span>
            )}
          </div>
        </>
      )}

      {error && <div className="form-error">{error}</div>}

      <div className="card section-top">
        <div className="status-block__head">
          <h2>Details</h2>
          {isDesk && !editingDetails && (
            <button type="button" className="btn btn--inline" onClick={startEditingDetails} disabled={busy}>
              Edit details
            </button>
          )}
        </div>

        {editingDetails ? (
          <>
            <div className="detail-grid">
              <label className="field">
                <span>Full name</span>
                <input value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} />
              </label>
              <label className="field">
                <span>Phone</span>
                <input value={editForm.phone} onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))} />
              </label>
              <label className="field">
                <span>Gender</span>
                <select value={editForm.gender} onChange={(e) => setEditForm((f) => ({ ...f, gender: e.target.value }))}>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                </select>
              </label>
              <label className="field">
                <span>Date of birth</span>
                <input type="date" value={editForm.dob} onChange={(e) => setEditForm((f) => ({ ...f, dob: e.target.value }))} />
              </label>
              <label className="field">
                <span>Weight (kg)</span>
                <input type="number" min="0" value={editForm.weight} onChange={(e) => setEditForm((f) => ({ ...f, weight: e.target.value }))} />
              </label>
              <label className="field">
                <span>Height (cm)</span>
                <input type="number" min="0" value={editForm.height} onChange={(e) => setEditForm((f) => ({ ...f, height: e.target.value }))} />
              </label>
              <label className="field">
                <span>Emergency contact name</span>
                <input value={editForm.emergencyName} onChange={(e) => setEditForm((f) => ({ ...f, emergencyName: e.target.value }))} />
              </label>
              <label className="field">
                <span>Emergency contact phone</span>
                <input value={editForm.emergencyPhone} onChange={(e) => setEditForm((f) => ({ ...f, emergencyPhone: e.target.value }))} />
              </label>
              <label className="field">
                <span>Address</span>
                <input value={editForm.address} onChange={(e) => setEditForm((f) => ({ ...f, address: e.target.value }))} />
              </label>
              <label className="field">
                <span>Email</span>
                <input type="email" value={editForm.email} onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))} />
              </label>
            </div>
            <div className="form-actions">
              <button className="btn btn--primary btn--inline" onClick={saveDetails} disabled={busy}>
                {busy ? "Saving…" : "Save details"}
              </button>{" "}
              <button className="btn btn--inline" onClick={() => setEditingDetails(false)} disabled={busy}>
                Cancel
              </button>
            </div>
          </>
        ) : (
          <div className="detail-grid">
            <div>
              <h4>Gender</h4>
              <p>{member.gender ? capitalize(member.gender) : <span className="muted">—</span>}</p>
            </div>
            <div>
              <h4>Date of birth</h4>
              <p>{member.dob ? formatDate(member.dob) : <span className="muted">—</span>}</p>
            </div>
            <div>
              <h4>Weight</h4>
              <p>{member.weight ? `${member.weight} kg` : <span className="muted">—</span>}</p>
            </div>
            <div>
              <h4>Height</h4>
              <p>{member.height ? `${member.height} cm` : <span className="muted">—</span>}</p>
            </div>
            <div>
              <h4>Emergency contact</h4>
              <p>{member.emergency_name || <span className="muted">—</span>}</p>
              {member.emergency_phone && <p className="muted">{member.emergency_phone}</p>}
            </div>
            <div>
              <h4>Address</h4>
              <p>{member.address || <span className="muted">—</span>}</p>
            </div>
            <div>
              <h4>Email</h4>
              <p>{member.email || <span className="muted">—</span>}</p>
            </div>
            {customFieldEntries.map((entry) => (
              <div key={entry.fieldId}>
                <h4>{entry.label}</h4>
                <p>{entry.value || <span className="muted">—</span>}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card section-top">
        <div className="tabs">
          <button
            className={`tab ${tab === "payments" ? "active" : ""}`}
            onClick={() => setTab("payments")}
          >
            Payments
          </button>
          <button
            className={`tab ${tab === "attendance" ? "active" : ""}`}
            onClick={() => setTab("attendance")}
          >
            Attendance
          </button>
        </div>
        {tab === "payments" ? (
          <HistoryList
            items={sortedPayments}
            emptyText="No payments yet."
            renderItem={(p) => (
              <>
                <span>
                  {p.plan_name} ({capitalize(p.for)})
                </span>
                <span>{formatMoney(p.amount, gym?.currency_code, gym?.country_code)}</span>
                <span className="muted">{formatDateTime(p.paid_at)}</span>
              </>
            )}
          />
        ) : (
          <HistoryList
            items={sortedAttendance}
            emptyText="No attendance yet."
            renderItem={(a) => <span>{formatDateTime(a.recorded_at)}</span>}
          />
        )}
      </div>
    </div>
  );
}

// One cell of the Membership & equipment grid — read-only status text for
// everyone, plus (when `editable`, i.e. desk) the renew/activate flow
// inline. `pending` (equipment only) means they've already paid but it
// won't start counting down until their next attendance — takes priority
// over whatever the last real record says, since that's the more relevant
// thing to show right now.
function PlanCell({ title, record, active, pending, plans, editable, busy, onPay, currencyCode, countryCode }) {
  const [picking, setPicking] = useState(false);
  const [planId, setPlanId] = useState(null);

  async function submit() {
    if (!planId) return;
    await onPay(planId);
    setPicking(false);
    setPlanId(null);
  }

  return (
    <div>
      <h4>{title}</h4>
      {pending ? (
        <>
          <p><span className="pill pill--caution">Pending</span></p>
          <p className="muted">Paid — starts counting on their next attendance.</p>
        </>
      ) : (
        <>
          <p>
            <StatusBadge active={active} activeLabel="Active" inactiveLabel={record ? "Expired" : "None"} />
          </p>
          {record && <p className="muted">{record.plan_name} · expires {formatDate(record.expiry_date)}</p>}
        </>
      )}

      {editable &&
        !pending &&
        (picking ? (
          <div className="section-top">
            <PlanPicker plans={plans} value={planId} onChange={setPlanId} currencyCode={currencyCode} countryCode={countryCode} />
            <div className="form-actions">
              <button className="btn btn--inline btn--primary" onClick={submit} disabled={busy || !planId}>
                {busy ? "Processing…" : "Collect payment"}
              </button>{" "}
              <button className="btn btn--inline" onClick={() => setPicking(false)} disabled={busy}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="form-actions">
            <button className="btn btn--inline" onClick={() => setPicking(true)} disabled={busy}>
              {active ? "Renew early" : record ? "Renew" : "Activate"}
            </button>
          </div>
        ))}
    </div>
  );
}
