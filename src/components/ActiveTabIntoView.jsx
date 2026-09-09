import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "../auth";

// Phone-only housekeeping for the bottom tab bar.
//
// On a phone the role shells' <nav class="sidebar__nav"> is a fixed bar
// along the bottom of the screen (see the mobile shell block in
// index.css). The short navs — the desk's four entries, the affiliate's
// two — fit across it exactly. The long ones (the owner's seven or eight,
// admin's eight) don't, so the bar scrolls sideways, and an entry past the
// fold can end up being the ACTIVE one with nothing on screen saying so:
// open /owner/settings from a bookmark, or come back to the app on the
// route it was left on, and the bar shows the first five tabs with none of
// them marked. This scrolls the active one into view so the bar always
// answers "where am I".
//
// Mounted once, inside the router in App.jsx, rather than in each of the
// four shells — the markup it looks for is identical in all of them, and
// one instance covers whichever is currently rendered. Renders nothing.
export default function ActiveTabIntoView() {
  const { pathname } = useLocation();
  // A cold load lands here before the shell exists: App.jsx shows a splash
  // until auth resolves, so on the first pass there is no nav to look at
  // and the pathname never changes afterwards to trigger a second one.
  // Re-running when the status settles is what covers opening the app
  // directly on a route whose tab is past the fold.
  const { status } = useAuth();

  useEffect(() => {
    // Only the mobile shell has a scrolling nav; on desktop the sidebar is
    // a full-height column and there is nothing to bring into view.
    const nav = document.querySelector(".sidebar__nav");
    if (!nav || nav.scrollWidth <= nav.clientWidth) return;
    const active = nav.querySelector(".sidebar__link.active");
    if (!active) return;
    // Centred rather than nearest-edge: a tab flush against the edge of
    // the bar reads as the last one, hiding the fact that more follow.
    active.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  }, [pathname, status]);

  return null;
}
