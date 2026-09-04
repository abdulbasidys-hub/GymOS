import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import WebsiteLayout from "../../components/website/WebsiteLayout";
import { IconCheckSmall } from "../../components/website/WebsiteIcons";
import { listPlatformPlans } from "../../data";
import { naira } from "../../lib/helpers";

// Turns a billing cycle into the short suffix a pricing card shows next to
// its price — duration_days is the one thing SubscriptionModal.jsx actually
// bills against, so it stays the single source of truth here too rather
// than a separate free-text "period" field that could drift from it.
function periodLabel(days) {
  if (days === 30) return "/mo";
  if (days === 365) return "/yr";
  if (days === 7) return "/wk";
  if (days === 90) return "/qtr";
  return `/${days}d`;
}

// max_branches/max_receptionists/max_members are NOT auto-rendered here —
// they're only for GymDetailPage.jsx/OwnerDetailPage.jsx's internal
// over-limit pills (BUILD.md §6/§18). This page shows exactly what the
// super admin typed into "Extra features" (Settings.jsx) and nothing else
// — auto-generating wording like "Unlimited" from a bare number/null used
// to guess wrong for an open-ended tier ("10+", "More than 3"), so the
// admin now writes the exact phrase they want shown, every time.

// Three placeholder columns shown while plans are loading, and also
// whenever the super admin hasn't created any yet — real numbers
// hardcoded here would go stale the moment pricing actually changes, so an
// empty/unloaded state reads as "still loading" rather than showing
// something fake. See Settings.jsx (super admin) for where these are set.
function PricingSkeleton() {
  return (
    <div className="site-pricing-grid" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <div className="site-pricing-card site-pricing-card--skeleton" key={i}>
          <div className="site-pricing-skeleton-bar site-pricing-skeleton-bar--name" />
          <div className="site-pricing-skeleton-bar site-pricing-skeleton-bar--price" />
          <div className="site-pricing-skeleton-bar site-pricing-skeleton-bar--line" />
          <div className="site-pricing-skeleton-bar site-pricing-skeleton-bar--line" />
          <div className="site-pricing-skeleton-bar site-pricing-skeleton-bar--line" />
        </div>
      ))}
    </div>
  );
}

export default function Pricing() {
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    listPlatformPlans()
      .then((p) => alive && setPlans(p.filter((x) => x.active)))
      .catch(() => {})
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  return (
    <WebsiteLayout>
      <section className="site-hero site-hero--narrow">
        <div className="site-hero__copy">
          <h1 className="site-hero__title">Simple pricing that grows with your gym</h1>
          <p className="site-hero__sub">
            Whether you&rsquo;re running a small gym, growing your membership, or managing multiple
            locations, there&rsquo;s a plan built for your business.
          </p>
          {/* Deliberately its own line rather than a third sentence in the
              paragraph above: it's the reassurance that answers "what if I
              pick wrong?", and it only does that job if it reads as a
              separate, definite statement instead of trailing off the end
              of a longer sentence. */}
          <p className="site-hero__kicker">
            Start with what you need today. Upgrade as your gym grows.
          </p>
        </div>
      </section>

      <section className="site-section">
        {loading || plans.length === 0 ? (
          <PricingSkeleton />
        ) : (
          <div className="site-pricing-grid">
            {plans.map((plan) => (
              <div className={`site-pricing-card ${plan.featured ? "site-pricing-card--featured" : ""}`} key={plan.id}>
                {plan.featured && <span className="site-pricing-card__badge">Most popular</span>}
                <h3 className="site-pricing-card__name">{plan.name}</h3>
                {plan.blurb && <p className="site-pricing-card__blurb">{plan.blurb}</p>}
                <div className="site-pricing-card__price">
                  {naira(plan.amount)}<span>{periodLabel(plan.duration_days)}</span>
                </div>
                <Link
                  to="/contact"
                  className={`btn ${plan.featured ? "btn--primary" : ""} btn--inline site-pricing-card__cta`}
                >
                  {plan.cta || "Get started"}
                </Link>
                {plan.features_intro && <p className="site-pricing-card__intro">{plan.features_intro}</p>}
                <ul className="site-checklist">
                  {(plan.features || []).map((f) => (
                    <li key={f}><IconCheckSmall /> {f}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}

        {/* Outside the loading/empty conditional above on purpose: this is
            static page copy, not per-plan content, so rendering it in every
            state keeps the page from reflowing once the tiers land. */}
        <div className="site-pricing-help">
          <h2>Not sure which plan is right for you?</h2>
          <p>
            Choose based on the size and stage of your gym. You can upgrade whenever your
            business grows.
          </p>
        </div>
      </section>
    </WebsiteLayout>
  );
}
