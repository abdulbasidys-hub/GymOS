import { useState } from "react";
import { NavLink, Link } from "react-router-dom";
import Logo from "../Logo";
import ThemeToggle from "../ThemeToggle";

const NAV = [
  { to: "/", label: "Home", end: true },
  { to: "/product", label: "Product" },
  { to: "/pricing", label: "Pricing" },
  { to: "/contact", label: "Contact" },
];

// Public marketing-site header — separate from the signed-in app's
// sidebar shell (App.jsx never mounts both). Reuses the exact brand mark
// (Logo + .topbar__brand-name/-accent) every dashboard topbar already
// uses, so the wordmark is pixel-identical between the marketing site and
// the product itself.
export default function WebsiteHeader() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="site-header">
      <div className="site-header__inner">
        {/* Mark, then name over tagline — the same lockup LoginPage.jsx
            uses, so the site header and the sign-in screen read as the
            same brand rather than two arrangements of the same parts. */}
        <Link to="/" className="site-header__brand" onClick={() => setMenuOpen(false)}>
          <Logo size={32} iconOnly />
          <span className="site-header__brand-text">
            <span className="topbar__brand-name">
              Gym<span className="topbar__brand-name-accent">OS</span>
            </span>
            <span className="site-header__tagline">
              Run Your Gym <span className="site-header__tagline-accent">Smarter</span>
            </span>
          </span>
        </Link>

        <nav className={`site-nav ${menuOpen ? "site-nav--open" : ""}`}>
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) => `site-nav__link ${isActive ? "active" : ""}`}
              onClick={() => setMenuOpen(false)}
            >
              {n.label}
            </NavLink>
          ))}
        </nav>

        <div className="site-header__actions">
          <ThemeToggle />
          <Link to="/login" className="btn btn--primary btn--inline">Sign in</Link>
          <button
            type="button"
            className="site-header__burger"
            aria-label="Toggle menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
          >
            <span /><span /><span />
          </button>
        </div>
      </div>
    </header>
  );
}
