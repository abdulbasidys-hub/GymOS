// App shell: auth gate + role-based routing.
//
// Electron: the login page IS the homepage — signed-out visitors at "/" see
// login directly (see Home() below). Web: "/" is the public marketing site
// (src/features/website/*), and sign-in lives at its own "/login" route.
// Either way, once signed in, "/" sends them to their own area (/desk,
// /owner, /admin), and they can't reach another role's — RequireRole
// redirects them. This routing is convenience; the real wall is
// firestore.rules.

import { BrowserRouter, HashRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./auth";
import { ThemeProvider } from "./theme";
import { homePathFor } from "./lib/roles";
import Logo from "./components/Logo";
import CloseButton from "./components/CloseButton";
import LoginPage from "./features/LoginPage";
import SetPasswordPage from "./features/SetPasswordPage";
import DeskHome from "./features/desk/DeskHome";
import OwnerDashboard from "./features/owner/OwnerDashboard";
import AdminDashboard from "./features/admin/AdminDashboard";
import AffiliateHome from "./features/affiliate/AffiliateHome";
import MarketingHome from "./features/website/MarketingHome";
import Product from "./features/website/Product";
import Pricing from "./features/website/Pricing";
import Contact from "./features/website/Contact";

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
  if (account?.must_change_password) return <SetPasswordPage />;
  if (userRole !== role) return <Navigate to={homePathFor(userRole)} replace />;
  return children;
}

// The homepage. Electron has no marketing site to show — it's a locally
// installed app for existing customers, so "/" stays the login page there
// exactly as before (that comment up top — "the login page IS the
// homepage" — is still true, just Electron-only now). The web build gets
// a real public marketing homepage instead, with sign-in moved to its own
// /login route.
function Home() {
  const { status, role, account } = useAuth();
  if (status === "loading") return <Splash />;
  if (status === "signedOut") {
    return window.gymOS?.isElectron ? <LoginPage /> : <MarketingHome />;
  }
  if (status === "noAccount") return <NoAccount />;
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

export default function App() {
  return (
    <ThemeProvider>
      {window.gymOS?.isElectron && <CloseButton />}
      <AuthProvider>
        <Router>
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
            <Route path="/product" element={<Product />} />
            <Route path="/pricing" element={<Pricing />} />
            <Route path="/contact" element={<Contact />} />
            <Route path="*" element={<Home />} />
          </Routes>
        </Router>
      </AuthProvider>
    </ThemeProvider>
  );
}
