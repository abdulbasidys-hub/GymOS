import { useState } from "react";
import { Link } from "react-router-dom";
import WebsiteLayout from "../../components/website/WebsiteLayout";
import { IconBolt, IconCheckSmall } from "../../components/website/WebsiteIcons";
import { IconSync } from "../../components/NavIcons";

const FEATURES = [
  {
    Icon: IconBolt,
    title: "Lightning-fast check-ins",
    body: "Search by name, phone, or member number and get a clear go / no-go verdict in under a second, with no digging through spreadsheets at the door.",
  },
  {
    Icon: IconCheckSmall,
    title: "Two independent clocks",
    body: "Membership and equipment access are tracked separately, so a lapsed payment and a suspended member are never confused with each other.",
  },
  {
    Icon: IconSync,
    title: "Keeps working offline",
    body: "Once your staff have signed in once, the front desk keeps running through outages. Check-ins, sign-ins, and records all sync back the moment the connection returns.",
  },
];

// The hero's product screenshot — a real, manually-captured image dropped
// into public/dashboard-screenshot.png, not a fabricated mockup of the UI.
// Falls back to a plain instruction if that file isn't there yet, instead
// of a broken-image icon.
function HeroPreview() {
  const [loaded, setLoaded] = useState(true);

  return (
    <div className="site-preview">
      <div className="site-preview__bar">
        <span className="site-preview__dot" />
        <span className="site-preview__dot" />
        <span className="site-preview__dot" />
      </div>
      {loaded ? (
        <img
          className="site-preview__image"
          src="/dashboard-screenshot.png"
          alt="GymOS dashboard"
          onError={() => setLoaded(false)}
        />
      ) : (
        <div className="site-preview__placeholder">
          Drop a screenshot of the app into
          <br />
          <code>public/dashboard-screenshot.png</code>
        </div>
      )}
    </div>
  );
}

export default function MarketingHome() {
  return (
    <WebsiteLayout>
      <section className="site-hero">
        <div className="site-hero__copy">
          <h1 className="site-hero__title">
            The high-frequency terminal for <span className="site-hero__title-accent">serious gyms</span>
          </h1>
          <p className="site-hero__sub">
            A front-desk terminal built for speed: search-and-verdict check-ins, plan and
            payment tracking, and a dashboard that keeps working even when the internet doesn&rsquo;t.
          </p>
          <div className="site-hero__actions">
            <Link to="/contact" className="btn btn--primary btn--inline">Get started</Link>
            <Link to="/pricing" className="btn btn--inline">See pricing</Link>
          </div>
        </div>
        <div className="site-hero__visual">
          <HeroPreview />
        </div>
      </section>

      <section className="site-section">
        <h2 className="site-section__title">Built for speed, designed for control</h2>
        <div className="site-feature-grid">
          {FEATURES.map(({ Icon, title, body }) => (
            <div className="site-feature-card" key={title}>
              <div className="site-feature-card__icon"><Icon /></div>
              <h3>{title}</h3>
              <p>{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* A standalone declaration, not another small badge — the tagline
          gets a real typographic moment of its own here, right before the
          close, instead of competing with the hero for attention as a
          tiny eyebrow pill above the headline (the more common pattern,
          and the one this replaced). */}
      <section className="site-statement">
        <p className="site-statement__text">
          Run your gym <span className="site-statement__accent">smarter</span>.
        </p>
      </section>

      <section className="site-cta">
        <h2>Ready to run a tighter front desk?</h2>
        <p>Tell us about your gym and we&rsquo;ll help you get set up.</p>
        <Link to="/contact" className="btn btn--primary btn--inline">Get started</Link>
      </section>
    </WebsiteLayout>
  );
}
