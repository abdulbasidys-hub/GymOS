import { useState } from "react";
import { Link } from "react-router-dom";
import WebsiteLayout from "../../components/website/WebsiteLayout";
import { submitGymEnquiry, ENQUIRY_LIMITS } from "../../data";

// This form used to do NOTHING — submit() called preventDefault() and
// stopped, so every enquiry anyone ever sent was silently dropped and the
// sender got no indication either way. It now writes to `gym_enquiries`,
// which super-admin reads on Inbox (features/admin/Inbox.jsx).
//
// Sent state rather than a toast: this is the only confirmation a stranger
// gets that their message exists, so it replaces the form instead of
// flashing past it. There is no email step — by the user's decision the
// inbox is in the app, so the promise made here is deliberately about
// getting back to them, not about a receipt landing in their mail.
export default function Contact() {
  const [name, setName] = useState("");
  const [gym, setGym] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function submit(e) {
    e.preventDefault();
    setError("");
    if (!name.trim() || !gym.trim() || !email.trim() || !message.trim()) {
      return setError("Please fill in every field.");
    }
    setBusy(true);
    try {
      await submitGymEnquiry({ name, gymName: gym, email, message });
      setSent(true);
    } catch {
      setError("Couldn't send that just now. Please try again, or email us directly.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <WebsiteLayout>
      <section className="site-hero site-hero--narrow">
        <div className="site-hero__copy">
          <h1 className="site-hero__title">Get in touch</h1>
          <p className="site-hero__sub">
            Whether you&rsquo;re looking to scale your facility or just need a hand getting started,
            our team is ready to help you optimize your operations.
          </p>
        </div>
      </section>

      <section className="site-section">
        <div className="site-contact-grid">
          {sent ? (
            <div className="site-contact-form">
              <h3>Message sent</h3>
              <p>
                Thank you &mdash; we have your message and we&rsquo;ll get back to you on{" "}
                <strong>{email.trim()}</strong>. If it&rsquo;s urgent, a phone call will always be
                faster than a form.
              </p>
              <button
                className="btn btn--inline"
                type="button"
                onClick={() => {
                  setSent(false);
                  setName("");
                  setGym("");
                  setEmail("");
                  setMessage("");
                }}
              >
                Send another
              </button>
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
                <span>Gym / facility name</span>
                <input
                  type="text"
                  value={gym}
                  onChange={(e) => setGym(e.target.value)}
                  maxLength={ENQUIRY_LIMITS.gymName}
                  required
                />
              </label>
              <label className="field">
                <span>Work email</span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  maxLength={ENQUIRY_LIMITS.email}
                  required
                />
              </label>
              <label className="field">
                <span>How can we help?</span>
                {/* maxLength matches the cap in firestore.rules, so an
                    over-long message is stopped by the field rather than
                    coming back as a permission error nobody can act on. */}
                <textarea
                  rows={5}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  maxLength={ENQUIRY_LIMITS.message}
                  required
                />
              </label>

              {error && <div className="form-error">{error}</div>}

              <button className="btn btn--primary btn--inline" type="submit" disabled={busy}>
                {busy ? "Sending…" : "Send message"}
              </button>
            </form>
          )}

          <div className="site-contact-card">
            <h3>Ready to check in?</h3>
            <p>If your gym already runs on GymOS, sign in to your dashboard.</p>
            <Link to="/login" className="btn btn--inline">Access dashboard</Link>

            <h3 className="site-contact-card__next">Want to sell GymOS?</h3>
            <p>
              We pay a commission on every gym you bring in. Tell us about yourself and we&rsquo;ll
              set you up.
            </p>
            <Link to="/become-an-affiliate" className="btn btn--primary btn--inline">
              Become an affiliate
            </Link>
          </div>
        </div>
      </section>
    </WebsiteLayout>
  );
}
