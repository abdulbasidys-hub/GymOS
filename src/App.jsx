// App shell: auth gate + role-based routing.
//
// Electron: the login page IS the homepage — signed-out visitors at "/" see
// login directly (see Home() below). Web: "/" is the public marketing site
// (src/features/website/*), and sign-in lives at its own "/login" route.
// Either way, once signed in, "/" sends them to their own area (/desk,
// /owner, /admin), and they can't reach another role's — RequireRole
// redirects them. This routing is convenience; the real wall is
// firestore.rules.

import { lazy, Suspense } from "react";
import { BrowserRouter, HashRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./auth";
import { ThemeProvider } from "./theme";
import { homePathFor } from "./lib/roles";
import { isInstalledApp } from "./lib/standalone";
import Logo from "./components/Logo";
import ActiveTabIntoView from "./components/ActiveTabIntoView";
import ResponsiveTables from "./components/ResponsiveTables";
import LoginPage from "./features/LoginPage";
import SetPasswordPage from "./features/SetPasswordPage";
import SuspendedScreen from "./components/SuspendedScreen";
// Split per destination, not eagerly imported.
//
// Every one of these used to be in the single entry chunk, so a receptionist
// opening the front desk downloaded the super-admin dashboard, the affiliate
// portal and the whole marketing site before the check-in screen could paint
// — roughly a megabyte of JavaScript to render a search box. Nobody is ever
// more than one of these roles, and a signed-in user never sees the marketing
// pages at all, so none of it belongs in the first download.
//
// The boundary is deliberately per ROLE rather than per screen: everything
// inside /desk is wanted the moment a receptionist arrives, and splitting
// further would trade one wait for several smaller ones.
const DeskHome = lazy(() => import("./features/desk/DeskHome"));
const OwnerDashboard = lazy(() => import("./features/owner/OwnerDashboard"));
const AdminDashboard = lazy(() => import("./features/admin/AdminDashboard"));
const AffiliateHome = lazy(() => import("./features/affiliate/AffiliateHome"));
const MarketingHome = lazy(() => import("./features/website/MarketingHome"));
const Product = lazy(() => import("./features/website/Product"));
const Pricing = lazy(() => import("./features/website/Pricing"));
const Contact = lazy(() => import("./features/website/Contact"));
const BecomeAffiliate = lazy(() => import("./features/website/BecomeAffiliate"));

function Splash({ text = "Loading…" }) {
  return (
    <div className="splash">
      <div className="splash__logo"><Logo size={59} /></div>
      <p className="muted">{text}</p>
    </div>
  );
}

function NoAccount() {
  const { user, signOut } = useAuth();
  return (
    <div className="splash">
      <div className="splash__logo"><Logo size={59} /></div>
      <p className="muted">
        No account is set up for {user?.email}.<br />
        Contact your provider.
      </p>
      <button className="btn" onClick={signOut}>Sign out</button>
    </div>
  );
}

// Gate a route to a single role.
function RequireRole({ role, children }) {
  const { status, role: userRole, account } = useAuth();
  if (status === "loading") return <Splash />;
  // "/login", not "/" — this is the redirect that runs when someone signs
  // out (every dashboard's Sign out button flips status to "signedOut"
  // while a protected route is mounted), and landing on the marketing
  // homepage after logging out of the product is jarring: the expectation
  // is the login screen, ready for the next person. "/" stays the
  // marketing homepage for actual visitors, who never pass through here.
  // Correct for the other path into this branch too — someone opening a
  // protected URL while signed out wants the sign-in form, not marketing.
  if (status === "signedOut") return <Navigate to="/login" replace />;
  if (status === "noAccount") return <NoAccount />;
  // Before must_change_password, and before the role check: a suspended
  // account gets no further into the app for any reason, not even to set a
  // password. `=== false` (not falsy) on purpose — an account record
  // predating this field has no `active` at all and must stay usable, which
  // is the same default firestore.rules' notSuspended() applies.
  if (account?.active === false) return <SuspendedScreen />;
  if (account?.must_change_password) return <SetPasswordPage />;
  if (userRole !== role) return <Navigate to={homePathFor(userRole)} replace />;
  return children;
}

// The homepage. An INSTALLED app has no marketing site to show — it's the
// gym's own application, opened to be worked in, so "/" is the login page
// there (that comment up top — "the login page IS the homepage" — is still
// true, now for the desktop build and the installed PWA alike; see
// lib/standalone.js). A browser visiting the site gets the real public
// marketing homepage instead, with sign-in on its own /login route.
function Home() {
  const { status, role, account } = useAuth();
  if (status === "loading") return <Splash />;
  if (status === "signedOut") {
    return isInstalledApp() ? <LoginPage /> : <MarketingHome />;
  }
  if (status === "noAccount") return <NoAccount />;
  if (account?.active === false) return <SuspendedScreen />;
  if (account?.must_change_password) return <SetPasswordPage />;
  return <Navigate to={homePathFor(role)} replace />;
}

// BrowserRouter's history.pushState/replaceState needs a real HTTP(S)
// origin — under Electron's packaged app, index.html loads via file://,
// and Chromium either throws a SecurityError on pushState to a path like
// "/owner" (no matching real file) or otherwise can't reconcile it with
// the document's file:// origin. This is exactly what happens on the very
// first post-login redirect (Home() below does <Navigate replace> to
// /desk or /owner) — invisible until now because this is the first real
// login this packaged build has ever gone through; every earlier check
// was either the web build (a real origin) or a standalone script.
// HashRouter sidesteps this entirely (file:///.../index.html#/owner —
// never touches the History API's path/origin machinery), so it's used
// for the Electron build only; the web build keeps BrowserRouter and its
// cleaner URLs unchanged.
const Router = window.gymOS?.isElectron ? HashRouter : BrowserRouter;

// The marketing pages, kept out of the installed app.
//
// The PWA's scope is the whole origin (public/manifest.webmanifest), which
// it has to be — anything narrower would push /desk and /owner out of the
// app and back into a browser tab. The cost of that is that a /pricing
// link tapped anywhere on the phone can be handed to the installed app to
// open. This sends those routes to the login screen instead, so the
// marketing site stays where it belongs: in a browser.
//
// Deliberately NOT applied to Electron-only reasoning — isInstalledApp()
// covers the desktop build too, where these routes were never reachable in
// any meaningful way (HashRouter, no address bar, no links to them).
function PublicSite({ children }) {
  return isInstalledApp() ? <Navigate to="/login" replace /> : children;
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <Router>
          {/* Keeps the phone tab bar's active entry on screen for the
              roles whose nav is too long to fit across it (see the
              component). Inside the router — it reads the location —
              and outside <Routes> so it survives every navigation. */}
          <ActiveTabIntoView />
          {/* Stamps every table with what index.css needs to fit it
              onto a phone — see the component. Same placement and
              reasoning as ActiveTabIntoView above. */}
          <ResponsiveTables />
          {/* The same Splash the app already shows while auth resolves, so a
              chunk still arriving looks like the wait it replaced rather than
              a new kind of blank. */}
          <Suspense fallback={<Splash />}>
          <Routes>
            <Route
              path="/desk/*"
              element={<RequireRole role="receptionist"><DeskHome /></RequireRole>}
            />
            <Route
              path="/owner/*"
              element={<RequireRole role="owner"><OwnerDashboard /></RequireRole>}
            />
            <Route
              path="/admin/*"
              element={<RequireRole role="superadmin"><AdminDashboard /></RequireRole>}
            />
            <Route
              path="/affiliate/*"
              element={<RequireRole role="affiliate"><AffiliateHome /></RequireRole>}
            />
            {/* LoginPage redirects itself to the right dashboard once status
                is "ready" (see its own top-of-component check), so this
                route needs no RequireRole wrapper. */}
            <Route path="/login" element={<LoginPage />} />
            <Route path="/product" element={<PublicSite><Product /></PublicSite>} />
            <Route path="/pricing" element={<PublicSite><Pricing /></PublicSite>} />
            <Route path="/contact" element={<PublicSite><Contact /></PublicSite>} />
            <Route
              path="/become-an-affiliate"
              element={<PublicSite><BecomeAffiliate /></PublicSite>}
            />
            <Route path="*" element={<Home />} />
          </Routes>
          </Suspense>
        </Router>
      </AuthProvider>
    </ThemeProvider>
  );
}
