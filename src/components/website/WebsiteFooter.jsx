import { Link } from "react-router-dom";

// Deliberately just a line of text — no logo mark, no nav.
//
// The mark was dropped because the header already carries the full lockup
// on every page; repeating it at the bottom of a short page is the same
// brand twice on one screen, not reinforcement. The Product/Pricing/Contact
// links went for the same reason — the header has them, and duplicating a
// three-item nav in the footer of a site this small is filler.
//
// Matches LoginPage.jsx's own footer line exactly ("GymOS by Nobody
// Brothers", with the OS in the brand green), so the marketing site and the
// product sign off identically. The wordmark keeps the shared
// .topbar__brand-name-accent token rather than hardcoding a green, so it
// tracks --accent like every other instance of the name.
export default function WebsiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer__inner">
        <Link to="/" className="site-footer__wordmark">
          Gym<span className="topbar__brand-name-accent">OS</span> by Nobody Brothers
        </Link>
      </div>
    </footer>
  );
}
