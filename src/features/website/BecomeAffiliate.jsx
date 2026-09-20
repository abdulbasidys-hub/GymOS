import { useState } from "react";
import { Link } from "react-router-dom";
import WebsiteLayout from "../../components/website/WebsiteLayout";
import { submitAffiliateApplication, uploadApplicantPhoto, ENQUIRY_LIMITS } from "../../data";

// "Become an affiliate" — a stranger asking to sell GymOS. Lands in
// `affiliate_applications`, which super-admin reads on Inbox.
//
// Four fields and a photo, by the user's decision: name, phone, email,
// picture. Everything else (bank details, how they plan to market) is asked
// later, by phone or once they're set up — a longer form filters out people
// who'd have been fine, and none of it is needed to make the judgement or
// the welcome flier.
//
// The photo is the reason this isn't just a message on the Contact page: it's
// what the welcome flier is made from, so the form says so plainly. People
// send a passport crop when they don't know what it's for.
//
// Upload BEFORE the document is created, deliberately. It means there is
// never a public UPDATE to attach the photo afterwards — the application is
// one write, and firestore.rules can forbid updates by the sender outright.
// The trade is an orphaned Storage object if someone uploads and then
// abandons the form; a stray image is cheaper than an update rule a stranger
// can reach.
export default function BecomeAffiliate() {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [photo, setPhoto] = useState(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function submit(e) {
    e.preventDefault();
    setError("");
    if (!name.trim() || !phone.trim() || !email.trim()) {
      return setError("Please fill in every field.");
    }
    if (!photo) return setError("Please attach a photo — we need it for your welcome flier.");

    setBusy(true);
    try {
      const photoPath = await uploadApplicantPhoto(photo);
      await submitAffiliateApplication({ name, phone, email, photoPath });
      setSent(true);
    } catch (err) {
      // uploadApplicantPhoto throws its own readable messages for a too-big
      // or non-image file; anything else is genuinely unexpected.
      setError(err?.message || "Couldn't send that just now. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <WebsiteLayout>
      <section className="site-hero site-hero--narrow">
        <div className="site-hero__copy">
          <h1 className="site-hero__title">Become an affiliate</h1>
          <p className="site-hero__sub">
            Bring gyms to GymOS and earn a commission on every payment they make &mdash; for as long
            as they stay. Tell us who you are and we&rsquo;ll be in touch.
          </p>
        </div>
      </section>

      <section className="site-section">
        <div className="site-contact-grid">
          {sent ? (
            <div className="site-contact-form">
              <h3>Application received</h3>
              <p>
                Thank you &mdash; we have your details and your photo. We&rsquo;ll review it and
                reach you on <strong>{phone.trim()}</strong> or <strong>{email.trim()}</strong>.
              </p>
              <p className="muted hint">
                If you&rsquo;re accepted we&rsquo;ll create your marketer account and send you a
                temporary password to sign in with.
              </p>
              <Link to="/" className="btn btn--inline">Back to home</Link>
            </div>
          ) : (
            <form className="site-contact-form" onSubmit={submit}>
              <label className="field">
                <span>Full name</span>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={ENQUIRY_LIMITS.name}
                  required
                />
              </label>
              <label className="field">
                <span>Phone</span>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  maxLength={ENQUIRY_LIMITS.phone}
                  required
                />
              </label>
              <label className="field">
                <span>Email</span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  maxLength={ENQUIRY_LIMITS.email}
                  required
                />
              </label>
              <label className="field">
                <span>Your photo</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
                  required
                />
                <span className="muted hint">
                  A clear photo of your face. We use this to make your welcome flier, so pick one
                  you&rsquo;re happy to be introduced with. Up to 5MB.
                </span>
              </label>

              {error && <div className="form-error">{error}</div>}

              <button className="btn btn--primary btn--inline" type="submit" disabled={busy}>
                {busy ? "Sending…" : "Submit application"}
              </button>
            </form>
          )}

          <div className="site-contact-card">
            <h3>How it works</h3>
            <p>
              Every gym you bring in is attached to your name. When they pay for GymOS, you earn
              your agreed share of that payment &mdash; automatically, every time, not just on the
              first one.
            </p>
            <p>
              You get your own portal: the gyms you&rsquo;ve brought, what you&rsquo;ve earned,
              what&rsquo;s still owed, and the app and guides to demonstrate it all.
            </p>
            <h3 className="site-contact-card__next">Already a marketer?</h3>
            <p>Sign in to see your gyms and earnings.</p>
            <Link to="/login" className="btn btn--inline">Sign in</Link>
          </div>
        </div>
      </section>
    </WebsiteLayout>
  );
}
