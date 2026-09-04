import { useState } from "react";
import { Link } from "react-router-dom";
import WebsiteLayout from "../../components/website/WebsiteLayout";

// No real backend yet (no email service, no Firestore collection) — by the
// user's own choice, this is UI only for now. Submitting just prevents the
// page reload; nothing is sent anywhere.
export default function Contact() {
  const [name, setName] = useState("");
  const [gym, setGym] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");

  function submit(e) {
    e.preventDefault();
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
          <form className="site-contact-form" onSubmit={submit}>
            <label className="field">
              <span>Full name</span>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} required />
            </label>
            <label className="field">
              <span>Gym / facility name</span>
              <input type="text" value={gym} onChange={(e) => setGym(e.target.value)} required />
            </label>
            <label className="field">
              <span>Work email</span>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </label>
            <label className="field">
              <span>How can we help?</span>
              <textarea
                rows={5}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                required
              />
            </label>
            <button className="btn btn--primary btn--inline" type="submit">Send message</button>
          </form>

          <div className="site-contact-card">
            <h3>Ready to check in?</h3>
            <p>If your gym already runs on GymOS, sign in to your dashboard.</p>
            <Link to="/login" className="btn btn--inline">Access dashboard</Link>
          </div>
        </div>
      </section>
    </WebsiteLayout>
  );
}
