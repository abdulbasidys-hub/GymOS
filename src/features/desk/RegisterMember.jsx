import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../../auth";
import {
  searchMembers,
  createMember,
  listPlans,
  listCustomFields,
  createPayment,
  createMembershipRecord,
  logActivity,
  uploadMemberPhoto,
} from "../../data";
import { computeExpiry } from "../../logic/expiry";
import PlanPicker from "../../components/PlanPicker";

const EMPTY_FORM = {
  name: "",
  phone: "",
  gender: "male",
  weight: "",
  height: "",
  emergencyName: "",
  emergencyPhone: "",
  address: "",
  dob: "",
  email: "",
};

export default function RegisterMember() {
  const { gymId, gym } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState(EMPTY_FORM);
  const [dupes, setDupes] = useState([]);
  const [checkingDupes, setCheckingDupes] = useState(false);
  const [confirmedAnyway, setConfirmedAnyway] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // Some gyms collect a passport photo at the desk, some don't, and some
  // just haven't taken it yet — never required to register (BUILD.md §8).
  // Uploaded as a best-effort last step after the member already exists,
  // never able to block or fail the registration itself.
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState(null);

  function handlePhotoChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
    setPhotoPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
  }
  function clearPhoto() {
    setPhotoFile(null);
    setPhotoPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
  }

  const [plans, setPlans] = useState([]);
  useEffect(() => {
    listPlans(gymId).then(setPlans).catch(() => {});
  }, [gymId]);

  // Extra questions the owner set up (GymSettings.jsx's "Registration
  // fields") — retired ones stay defined but stop appearing here.
  const [customFields, setCustomFields] = useState([]);
  const [customValues, setCustomValues] = useState({});
  useEffect(() => {
    listCustomFields(gymId)
      .then((f) => setCustomFields(f.filter((field) => field.active !== false)))
      .catch(() => {});
  }, [gymId]);

  const membershipPlans = plans.filter((p) => p.type === "membership");
  const equipmentPlans = plans.filter((p) => p.type === "equipment");

  const [membershipPlanId, setMembershipPlanId] = useState(null);
  const [wantsEquipment, setWantsEquipment] = useState(false);
  const [equipmentPlanId, setEquipmentPlanId] = useState(null);

  function set(field) {
    return (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  }
  function setCustomValue(fieldId) {
    return (e) => setCustomValues((v) => ({ ...v, [fieldId]: e.target.value }));
  }

  if (!gym) return <p className="empty">Loading…</p>;

  async function checkPhone(phone) {
    setDupes([]);
    setConfirmedAnyway(false);
    const clean = phone.trim();
    if (clean.length < 5) return;
    setCheckingDupes(true);
    try {
      setDupes(await searchMembers(gymId, clean));
    } finally {
      setCheckingDupes(false);
    }
  }

  async function submit(e) {
    e.preventDefault();
    setError("");

    if (!form.name.trim()) return setError("Enter the member's name.");
    if (!form.phone.trim()) return setError("Enter a phone number.");
    if (!form.weight.trim()) return setError("Enter the member's weight.");
    if (!form.height.trim()) return setError("Enter the member's height.");
    if (!form.emergencyName.trim()) return setError("Enter an emergency contact name.");
    if (!form.emergencyPhone.trim()) return setError("Enter an emergency contact phone number.");
    if (!form.address.trim()) return setError("Enter an address.");
    for (const f of customFields) {
      if (f.required && !String(customValues[f.id] ?? "").trim()) {
        return setError(`Fill in "${f.label}" — required to register.`);
      }
    }
    if (!membershipPlanId) return setError("Select a membership plan — required to register.");
    if (dupes.length > 0 && !confirmedAnyway)
      return setError("A member with this phone already exists — confirm below to create a new one anyway.");
    if (wantsEquipment && !equipmentPlanId) return setError("Select an equipment plan, or uncheck the box.");

    setBusy(true);
    try {
      const cleanCustomFields = Object.fromEntries(
        Object.entries(customValues).filter(([, v]) => String(v ?? "").trim() !== "")
      );

      const member = await createMember({
        gymId,
        gymPrefix: gym.prefix,
        name: form.name,
        phone: form.phone,
        gender: form.gender,
        weight: form.weight,
        height: form.height,
        emergencyName: form.emergencyName,
        emergencyPhone: form.emergencyPhone,
        address: form.address,
        dob: form.dob || undefined,
        email: form.email || undefined,
        customFields: cleanCustomFields,
      });

      const membershipPlan = membershipPlans.find((p) => p.id === membershipPlanId);
      const mStart = new Date();
      const mPayment = await createPayment({
        gymId,
        memberId: member.id,
        planId: membershipPlan.id,
        planName: membershipPlan.name,
        planType: membershipPlan.type,
        amount: membershipPlan.price,
        forType: "membership",
      });
      await createMembershipRecord({
        gymId,
        memberId: member.id,
        planId: membershipPlan.id,
        planName: membershipPlan.name,
        startDate: mStart,
        expiryDate: computeExpiry(mStart, membershipPlan.duration_count, membershipPlan.duration_unit),
        paymentId: mPayment.id,
      });

      if (wantsEquipment) {
        const equipmentPlan = equipmentPlans.find((p) => p.id === equipmentPlanId);
        // No equipment_record here — access doesn't start counting down until
        // their first attendance (MemberProfile.jsx activates it then, using
        // the duration frozen onto this payment).
        await createPayment({
          gymId,
          memberId: member.id,
          planId: equipmentPlan.id,
          planName: equipmentPlan.name,
          planType: equipmentPlan.type,
          amount: equipmentPlan.price,
          forType: "equipment",
          durationCount: equipmentPlan.duration_count,
          durationUnit: equipmentPlan.duration_unit,
        });
      }

      await logActivity({
        gymId,
        action: "Registered member",
        target: `${member.name} (${member.member_no})`,
      });

      // Best-effort, isolated from the try/catch above: the member is
      // already fully registered at this point, so a failed photo upload
      // (e.g. no connection) must never surface as a registration error —
      // it can always be added from their profile instead.
      if (photoFile) {
        try {
          await uploadMemberPhoto(gymId, member.id, photoFile);
        } catch (photoErr) {
          console.error("Photo upload failed — can be added later from the profile.", photoErr);
        }
      }

      navigate(`/desk/member/${member.id}`);
    } catch (err) {
      console.error(err);
      setError("Couldn't register this member.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
    <button type="button" className="back-link" onClick={() => navigate(-1)}>&larr; Back</button>

    <div className="page-header">
      <h1>New member registration</h1>
      <p>Complete the form below to enroll a new member.</p>
    </div>

    <form onSubmit={submit}>
      <div className="form-layout">
        <div className="form-layout__main">
          <div className="card">
            <h2>Personal details</h2>
            <div className="row2">
              <label className="field">
                <span>Full name</span>
                <input value={form.name} onChange={set("name")} required />
              </label>
              <label className="field">
                <span>Phone number</span>
                <input
                  value={form.phone}
                  onChange={(e) => {
                    set("phone")(e);
                    checkPhone(e.target.value);
                  }}
                  required
                />
              </label>
            </div>

            {checkingDupes && <p className="muted hint">Checking for existing members…</p>}
            {dupes.length > 0 && (
              <div className="form-error">
                Found {dupes.length} existing member(s) with this phone:
                <ul>
                  {dupes.map((d) => (
                    <li key={d.id}>
                      <Link to={`/desk/member/${d.id}`}>
                        {d.name} · {d.member_no}
                      </Link>
                    </li>
                  ))}
                </ul>
                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={confirmedAnyway}
                    onChange={(e) => setConfirmedAnyway(e.target.checked)}
                  />
                  Create a new member anyway
                </label>
              </div>
            )}

            <div className="row2">
              <label className="field">
                <span>Gender</span>
                <select value={form.gender} onChange={set("gender")}>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                </select>
              </label>
              <label className="field">
                <span>Date of birth (optional)</span>
                <input type="date" value={form.dob} onChange={set("dob")} />
              </label>
            </div>

            <label className="field">
              <span>Photo (optional)</span>
              {photoPreviewUrl ? (
                <div className="member-photo-picker">
                  <img src={photoPreviewUrl} alt="" className="avatar-badge avatar-badge--lg" />
                  <button type="button" className="btn btn--inline" onClick={clearPhoto}>Remove</button>
                </div>
              ) : (
                <input type="file" accept="image/*" onChange={handlePhotoChange} />
              )}
            </label>
            <p className="muted hint">
              Not needed to register — some gyms collect a passport photo, some don't, and it's always fine to
              add or change one later from the member's profile.
            </p>

            <div className="row2">
              <label className="field">
                <span>Weight (kg)</span>
                <input type="number" min="0" value={form.weight} onChange={set("weight")} required />
              </label>
              <label className="field">
                <span>Height (cm)</span>
                <input type="number" min="0" value={form.height} onChange={set("height")} required />
              </label>
            </div>
          </div>

          <div className="card">
            <h2>Emergency contact &amp; address</h2>
            <div className="row2">
              <label className="field">
                <span>Emergency contact name</span>
                <input value={form.emergencyName} onChange={set("emergencyName")} required />
              </label>
              <label className="field">
                <span>Emergency contact phone</span>
                <input value={form.emergencyPhone} onChange={set("emergencyPhone")} required />
              </label>
            </div>

            <div className="row2">
              <label className="field">
                <span>Address</span>
                <input value={form.address} onChange={set("address")} required />
              </label>
              <label className="field">
                <span>Email (optional)</span>
                <input type="email" value={form.email} onChange={set("email")} />
              </label>
            </div>
          </div>

          {customFields.length > 0 && (
            <div className="card">
              <h2>Additional information</h2>
              {customFields.map((f) => (
                <label key={f.id} className="field">
                  <span>
                    {f.label}
                    {!f.required && " (optional)"}
                  </span>
                  {f.type === "yesno" ? (
                    <select value={customValues[f.id] ?? ""} onChange={setCustomValue(f.id)} required={f.required}>
                      <option value="">Select…</option>
                      <option value="yes">Yes</option>
                      <option value="no">No</option>
                    </select>
                  ) : (
                    <input
                      type={f.type === "number" ? "number" : "text"}
                      value={customValues[f.id] ?? ""}
                      onChange={setCustomValue(f.id)}
                      required={f.required}
                    />
                  )}
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="form-layout__side">
          <div className="card">
            <h2>Membership</h2>
            <p className="muted hint">Required to register.</p>
            <PlanPicker
              plans={membershipPlans}
              value={membershipPlanId}
              onChange={setMembershipPlanId}
              currencyCode={gym?.currency_code}
              countryCode={gym?.country_code}
              emptyText="No membership tiers yet — ask your owner to create one."
            />
          </div>

          <div className="card">
            <h2>Equipment access</h2>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={wantsEquipment}
                onChange={(e) => setWantsEquipment(e.target.checked)}
              />
              Pay for equipment access now
            </label>
            {wantsEquipment && (
              <div className="section-top">
                <PlanPicker
                  plans={equipmentPlans}
                  value={equipmentPlanId}
                  onChange={setEquipmentPlanId}
                  currencyCode={gym?.currency_code}
                  countryCode={gym?.country_code}
                  emptyText="No equipment plans yet — ask your owner to create one."
                />
              </div>
            )}
          </div>
        </div>

        <div className="form-layout__footer">
          {error && <div className="form-error">{error}</div>}
          <button className="btn" type="button" onClick={() => navigate(-1)} disabled={busy}>
            Cancel
          </button>
          <button className="btn btn--primary" type="submit" disabled={busy}>
            {busy ? "Registering…" : "Register member"}
          </button>
        </div>
      </div>
    </form>
    </>
  );
}
