import { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";

// The phone tab bar's overflow menu.
//
// A bottom bar only holds a handful of destinations before every label
// shrinks to an unreadable sliver, so the roles with long navs (owner,
// super admin) show their most-used few as tabs and put the rest behind
// this. It sits at the FAR LEFT of the bar, with Settings pinned at the far
// right, so the two "everything else" controls bracket the real
// destinations instead of competing with them.
//
// Phone-only: on a desktop sidebar every link is already visible, so the
// button is hidden entirely (index.css) and this renders nothing that
// matters there.

function BurgerIcon() {
  return (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="4" y1="7" x2="20" y2="7" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <line x1="4" y1="17" x2="20" y2="17" />
    </svg>
  );
}

export default function NavMore({ items }) {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();

  // Close on navigation — without this, tapping a link in the sheet leaves
  // the sheet covering the page you just asked for.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // A phone's back gesture doesn't apply here (no route changed), so Escape
  // is the only keyboard way out.
  useEffect(() => {
    if (!open) return;
    function onKey(e) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!items || items.length === 0) return null;

  // Marks the burger itself as the active tab when the page being viewed
  // lives inside the sheet rather than on the bar — otherwise none of the
  // visible tabs is lit and the bar looks broken.
  const holdsCurrent = items.some((n) =>
    n.end ? pathname === n.to : pathname.startsWith(n.to)
  );

  return (
    <>
      <button
        type="button"
        className={`sidebar__link nav-more ${holdsCurrent ? "active" : ""}`}
        onClick={() => setOpen((v) => !v)}
        aria-label="More pages"
        aria-expanded={open}
      >
        <BurgerIcon />
        More
      </button>

      {open && (
        <>
          <div className="nav-sheet__scrim" onClick={() => setOpen(false)} />
          <div className="nav-sheet" role="dialog" aria-label="More pages">
            <div className="nav-sheet__grip" aria-hidden="true" />
            {items.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                className={({ isActive }) => `nav-sheet__link ${isActive ? "active" : ""}`}
              >
                <n.Icon />
                {n.label}
              </NavLink>
            ))}
          </div>
        </>
      )}
    </>
  );
}
