import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../auth";
import { createGym, createOwner, addBranchToOwner, listAffiliates, listOwners, logAdminActivity, startFreeTrial } from "../../data";
import CountryPicker from "../../components/CountryPicker";
import OwnerPicker from "../../components/OwnerPicker";
import { countryByCode } from "../../lib/countries";

const MODES = [
  { value: "new", label: "New owner" },
  { value: "existing", label: "Existing owner" },
];

// How long a brand-new gym gets for free before it has to pay. Promotions
// are the point: most gyms won't buy on the spot, so the trial is the hook
// that gets the software onto their desk. "0" means no trial at all -- the
// gym starts with no subscription, exactly as it always did, and the super
// admin sets one up from the subscription screen.
//
// Only offered in "new owner" mode. A branch added to an existing owner
// joins that owner's pooled subscription (BUILD.md 6), so it has nothing
// of its own to give away.
const TRIAL_MONTHS = [
  { value: 0, label: "No free trial — start on a paid plan" },
  { value: 1, label: "1 month free" },
  { value: 2, label: "2 months free" },
  { value: 3, label: "3 months free" },
  { value: 6, label: "6 months free" },
];

// Rendered inside a Modal (GymsList.jsx) — no card wrapper or heading of its
// own, the modal supplies both. Two modes (BUILD.md §6): a brand-new gym
// under a brand-new owner login (the original flow, unchanged), or a new
// BRANCH attached to an owner who already manages at least one gym — no
// new login, no affiliate attribution (decided once, at an owner's
// original signup — see addBranchToOwner's own comment).
export default function NewGym() {
  const navigate = useNavigate();
  const { account } = useAuth();
  const [mode, setMode] = useState("new");
  const [gymName, setGymName] = useState("");
  const [prefix, setPrefix] = useState("");
  const [address, setAddress] = useState("");
  const [country, setCountry] = useState(countryByCode("NG"));
  const [ownerName, setOwnerName] = useState("");
  const [ownerPhone, setOwnerPhone] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [affiliateId, setAffiliateId] = useState("");
  const [affiliates, setAffiliates] = useState([]);
  const [owners, setOwners] = useState([]);
  const [existingOwner, setExistingOwner] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [trialMonths, setTrialMonths] = useState(1);
  const [trialEndsOn, setTrialEndsOn] = useState(null); // set once the trial is actually started
  const [createdOwner, setCreatedOwner] = useState(null); // { username, tempPassword } — shown once, "new" mode only
  const [branchAdded, setBranchAdded] = useState(null); // ownerName — shown once, "existing" mode only
  const [gymId, setGymId] = useState(null);

  useEffect(() => {
    listAffiliates().then(setAffiliates).catch(() => {});
    listOwners().then(setOwners).catch(() => {});
  }, []);

  function switchMode(next) {
    setMode(next);
    setError("");
  }

  async function submit(e) {
    e.preventDefault();
    setError("");
    const cleanGymName = gymName.trim();
    const cleanPrefix = prefix.trim().toUpperCase();
    const cleanAddress = address.trim();
    const cleanOwnerName = ownerName.trim();
    const cleanOwnerPhone = ownerPhone.trim();

    if (!cleanGymName) return setError("Enter a gym name.");
    if (!/^[A-Z0-9]{2,6}$/.test(cleanPrefix))
      return setError("Prefix must be 2–6 letters or numbers.");
    if (!cleanAddress) return setError("Enter the gym's address.");
    if (!country) return setError("Pick the gym's country from the list.");
    if (mode === "new") {
      if (!cleanOwnerName) return setError("Enter the owner's name.");
      if (!cleanOwnerPhone) return setError("Enter the owner's phone number.");
    } else if (!existingOwner) {
      return setError("Pick the owner this branch belongs to.");
    }

    const affiliate = mode === "new" ? affiliates.find((a) => a.id === affiliateId) : null;

    setBusy(true);
    try {
      const gym = await createGym({
        name: cleanGymName,
        prefix: cleanPrefix,
        address: cleanAddress,
        affiliateId: affiliate?.id,
        affiliateName: affiliate?.name,
        countryCode: country.code,
        countryName: country.name,
        currencyCode: country.currency,
      });
      await logAdminActivity({
        gymId: gym.id,
        gymName: gym.name,
        activity: mode === "new" ? "Gym account created" : "Branch added to existing owner",
        status: "active",
        performedBy: account?.name,
      });

      if (mode === "new") {
        const owner = await createOwner({
          username: `${cleanPrefix.toLowerCase()}-owner`,
          name: cleanOwnerName,
          gymId: gym.id,
          phone: cleanOwnerPhone,
          email: ownerEmail.trim(),
        });
        // The trial belongs to the OWNER, not the gym -- subscriptions are
        // pooled per owner and mirrored onto each of their gyms, so this is
        // the same path a paid plan takes.
        if (Number(trialMonths) > 0) {
          const endsOn = await startFreeTrial(owner.id, [gym.id], Number(trialMonths));
          setTrialEndsOn(endsOn);
          await logAdminActivity({
            gymId: gym.id,
            gymName: gym.name,
            activity: `Free trial started — ${trialMonths} month${Number(trialMonths) === 1 ? "" : "s"}`,
            status: "active",
            performedBy: account?.name,
          });
        }
        setGymId(gym.id);
        setCreatedOwner({ username: owner.username, tempPassword: owner.tempPassword });
      } else {
        await addBranchToOwner(existingOwner, gym.id);
        setGymId(gym.id);
        setBranchAdded(existingOwner.name);
      }
    } catch (err) {
      console.error(err);
      if (err?.code === "prefix-taken") setError(`Prefix ${cleanPrefix} is already used by another gym.`);
      else if (err?.code === "auth/email-already-in-use") setError("That owner username is already taken.");
      else setError("Couldn't create the gym.");
      setBusy(false);
    }
  }

  if (createdOwner) {
    return (
      <>
        <div className="notice">
          Share this temporary password with <code>{createdOwner.username}</code>:{" "}
          <code>{createdOwner.tempPassword}</code>
          <br />
          They'll be asked to set their own on first login.
        </div>
        {trialEndsOn ? (
          <div className="notice">
            <strong>Free trial running.</strong> This gym has full access until{" "}
            <strong>{trialEndsOn.toLocaleDateString()}</strong>, then it locks until a paid plan is
            added. Nothing they record during the trial is ever lost.
          </div>
        ) : (
          <div className="notice">
            No free trial was given — set this owner up with a plan from their subscription screen.
          </div>
        )}
        <div className="form-actions">
          <button className="btn btn--primary btn--inline" onClick={() => navigate(`/admin/gyms/${gymId}`)}>
            Go to gym →
          </button>
        </div>
      </>
    );
  }

  if (branchAdded) {
    return (
      <>
        <div className="notice">
          Branch added to <strong>{branchAdded}</strong>&rsquo;s account. No new login was created — they'll see
          this branch next time they sign in.
        </div>
        <div className="form-actions">
          <button className="btn btn--primary btn--inline" onClick={() => navigate(`/admin/gyms/${gymId}`)}>
            Go to gym →
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="tabs">
        {MODES.map((m) => (
          <button
            key={m.value}
            type="button"
            className={`tab ${mode === m.value ? "active" : ""}`}
            onClick={() => switchMode(m.value)}
          >
            {m.label}
          </button>
        ))}
      </div>

      <form onSubmit={submit} className="section-top">
        <div className="row2">
          <label className="field">
            <span>Gym name</span>
            <input
              value={gymName}
              onChange={(e) => setGymName(e.target.value)}
              required
              autoFocus
            />
          </label>
          <label className="field">
            <span>Prefix</span>
            <input
              value={prefix}
              onChange={(e) => setPrefix(e.target.value.toUpperCase())}
              maxLength={6}
              autoCapitalize="characters"
              spellCheck="false"
              required
            />
          </label>
        </div>

        {/* Plain .row2 (2fr 1fr), matching every other paired row in this
            form — it was .row2--even (1fr 1fr), which made "Gym address"
            narrower than the full-width fields above and below it and left
            "Country" starting further left than Prefix / Owner phone /
            Affiliate marketer. One shared ratio means the wide column and
            the narrow column each keep a single edge all the way down. */}
        <div className="row2">
          <label className="field">
            <span>Gym address</span>
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              required
            />
          </label>
          <label className="field">
            <span>Country</span>
            <CountryPicker value={country} onChange={setCountry} />
          </label>
        </div>
        {country && (
          <p className="muted hint">
            Prices and revenue at this gym will show in {country.currency} ({country.name}).
          </p>
        )}

        {mode === "new" ? (
          <>
            <div className="row2">
              <label className="field">
                <span>Owner name</span>
                <input
                  value={ownerName}
                  onChange={(e) => setOwnerName(e.target.value)}
                  required
                />
              </label>
              <label className="field">
                <span>Owner phone</span>
                <input
                  value={ownerPhone}
                  onChange={(e) => setOwnerPhone(e.target.value)}
                  required
                />
              </label>
            </div>

            <div className="row2">
              <label className="field">
                <span>Owner email</span>
                <input type="email" value={ownerEmail} onChange={(e) => setOwnerEmail(e.target.value)} />
              </label>
              <label className="field">
                <span>Affiliate marketer (optional)</span>
                <select value={affiliateId} onChange={(e) => setAffiliateId(e.target.value)}>
                  <option value="">None — full revenue stays with the platform</option>
                  {affiliates.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className="field">
              <span>Free trial</span>
              <select value={trialMonths} onChange={(e) => setTrialMonths(Number(e.target.value))}>
                {TRIAL_MONTHS.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
            <p className="muted hint">
              {Number(trialMonths) > 0 ? (
                <>
                  Full access, free, for {trialMonths} month{Number(trialMonths) === 1 ? "" : "s"} from
                  today. When it runs out the gym locks until a paid plan is added — nothing they
                  recorded is lost, and it all comes back the moment you add one. No platform revenue
                  and no affiliate commission is recorded for a trial.
                </>
              ) : (
                <>
                  This gym starts with no subscription. Add a plan from the owner's subscription screen
                  when they pay.
                </>
              )}
            </p>
          </>
        ) : (
          <>
            <label className="field">
              <span>Owner</span>
              <OwnerPicker owners={owners} value={existingOwner} onChange={setExistingOwner} />
            </label>
            <p className="muted hint">
              This branch joins that owner's existing pooled subscription — no new login, no affiliate
              attribution (that's decided once, at an owner's original signup).
            </p>
          </>
        )}

        {error && <div className="form-error">{error}</div>}

        <div className="form-actions">
          <button className="btn btn--primary btn--inline" type="submit" disabled={busy}>
            {busy ? "Creating…" : mode === "new" ? "Create gym" : "Add branch"}
          </button>
        </div>
      </form>

      {mode === "new" ? (
        <p className="muted hint">
          Members here will be numbered{" "}
          {prefix ? `${prefix.toUpperCase()}-0001` : "PREFIX-0001"} and up. The
          prefix is permanent. The owner's username will be{" "}
          {prefix ? `${prefix.toLowerCase()}-owner` : "prefix-owner"}.
        </p>
      ) : (
        <p className="muted hint">
          Members here will be numbered{" "}
          {prefix ? `${prefix.toUpperCase()}-0001` : "PREFIX-0001"} and up. The prefix is permanent.
        </p>
      )}
    </>
  );
}
