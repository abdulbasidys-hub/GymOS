import WebsiteLayout from "../../components/website/WebsiteLayout";
import { IconBolt, IconDesk, IconCheckSmall } from "../../components/website/WebsiteIcons";
import { IconChart } from "../../components/NavIcons";

const PORTALS = [
  {
    Icon: IconDesk,
    role: "Receptionist",
    body: "Runs the front desk: search-and-verdict check-ins, today's schedule, and urgent alerts. Nothing else to get lost in.",
  },
  {
    Icon: IconChart,
    role: "Owner",
    body: "A real-time dashboard for the whole gym: revenue, attendance, staff, and member records, with full read/write control.",
  },
];

export default function Product() {
  return (
    <WebsiteLayout>
      <section className="site-hero site-hero--narrow">
        <div className="site-hero__copy">
          <h1 className="site-hero__title">
            Built for <span className="site-hero__title-accent">serious gyms.</span>
          </h1>
          <p className="site-hero__sub">
            See how GymOS turns a chaotic front desk into a fast, verifiable check-in process.
          </p>
        </div>
      </section>

      <section className="site-section">
        <div className="site-split">
          <div className="site-split__copy">
            <div className="site-feature-card__icon"><IconBolt /></div>
            <h2>The verdict system</h2>
            <p>
              One search, by name, phone, or member number, returns one clear verdict.
              Green means go, red means stop. No spreadsheets, no guesswork at the door.
            </p>
            <ul className="site-checklist">
              <li><IconCheckSmall /> Immediate visual feedback for every check-in</li>
              <li><IconCheckSmall /> Expired or suspended access is blocked automatically</li>
            </ul>
          </div>
          <div className="site-split__visual">
            <div className="verdict verdict--ok site-verdict-demo">
              <div className="verdict__headline">Entry allowed</div>
              <div className="verdict__rows">
                <div className="verdict__row"><span>Membership</span><span className="pill pill--active">Active</span></div>
                <div className="verdict__row"><span>Equipment</span><span className="pill pill--active">Active</span></div>
              </div>
            </div>
            <div className="verdict verdict--bad site-verdict-demo">
              <div className="verdict__headline">Entry blocked</div>
              <div className="verdict__rows">
                <div className="verdict__row"><span>Membership</span><span className="pill pill--bad">Expired</span></div>
                <div className="verdict__row"><span>Equipment</span><span className="pill pill--active">Active</span></div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="site-section">
        <h2 className="site-section__title">Role-based portals</h2>
        <div className="site-feature-grid site-feature-grid--2">
          {PORTALS.map(({ Icon, role, body }) => (
            <div className="site-feature-card" key={role}>
              <div className="site-feature-card__icon"><Icon /></div>
              <h3>{role}</h3>
              <p>{body}</p>
            </div>
          ))}
        </div>
      </section>
    </WebsiteLayout>
  );
}
