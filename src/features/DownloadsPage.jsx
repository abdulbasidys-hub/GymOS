import { useEffect, useState } from "react";
import { useAuth } from "../auth";
import { DOWNLOAD_KINDS, listDownloads } from "../data";

// Self-service downloads: the desktop installer, and whichever PDF guides
// the signed-in role is entitled to. The point is that someone who isn't
// sitting with the super admin can still get themselves set up — sign in
// through the browser, take the app and the guide, and go.
//
// One component for every role rather than three near-identical pages: the
// only difference is WHICH entries are listed, which DOWNLOAD_KINDS.roles
// already describes. An owner sees the app plus the owner's guide (which
// covers the front desk too, so they can train their own staff); a
// receptionist sees the front-desk guide only; an affiliate marketer sees
// the app plus BOTH guides, since they demo the product and train a gym's
// first week.

// `embedded` drops the page heading and the outer card so this can sit as a
// section inside another page — which is how the front desk reaches it on a
// phone, where Downloads no longer has a tab of its own (DeskSettings.jsx).
export default function DownloadsPage({ embedded = false }) {
  const { role } = useAuth();
  const [entries, setEntries] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    listDownloads()
      .then((rows) => {
        if (!alive) return;
        setEntries(Object.fromEntries(rows.map((r) => [r.id, r])));
      })
      // This page reads Firestore directly and the files themselves live on
      // the network, so unlike every other screen in the desktop app there
      // is no offline story here and shouldn't be — say so plainly rather
      // than showing a bare "couldn't load" that reads like a bug.
      .catch(
        () =>
          alive &&
          setError(
            window.gymOS?.isElectron
              ? "Downloads need an internet connection. Reconnect and try again."
              : "Couldn't load the downloads."
          )
      )
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  // webOnly entries (the installer) are hidden inside the desktop app —
  // you don't download the installer from the thing it installed.
  const isElectron = !!window.gymOS?.isElectron;
  const visible = DOWNLOAD_KINDS.filter(
    (k) => k.roles.includes(role) && !(isElectron && k.webOnly)
  );

  if (loading) return <p className="empty">Loading…</p>;

  // The heading has to describe what THIS role can actually see: not every
  // role is offered the installer, and a marketer gets two guides rather
  // than one (data/downloads.js). Counted rather than hardcoded per role, so
  // adding an entry to DOWNLOAD_KINDS can't leave this sentence lying.
  const hasInstaller = visible.some((k) => k.id === "desktop_app");
  const guideCount = visible.filter((k) => k.id.startsWith("guide_")).length;
  const guideWord = guideCount > 1 ? "the guides" : "your guide";

  const rows = (
    <>
        {visible.map((kind) => {
          const entry = entries[kind.id];
          return (
            <div className="download-row" key={kind.id}>
              <div className="download-row__text">
                <h3>{kind.label}</h3>
                {/* Deliberately only a title and a button. The version,
                    file name, size and upload date were shown here and are
                    gone on purpose: none of them change what the person
                    does next, which is press Download. The one line kept is
                    the one that explains a button that cannot be pressed. */}
                {!entry && <p className="muted">Not available yet — check back shortly.</p>}
                {entry?.notes && <p className="muted hint">{entry.notes}</p>}
              </div>
              {entry?.url ? (
                // Plain anchor, not a fetch-and-save: the file may be a
                // 120MB installer served from another host, and letting the
                // browser stream it straight to disk avoids pulling all of
                // it through the page's memory first. `download` is only a
                // hint cross-origin, which is fine — the worst case is the
                // browser navigating to the file, which still downloads it.
                <a
                  className="btn btn--primary btn--inline"
                  href={entry.url}
                  download={entry.file_name || ""}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Download
                </a>
              ) : (
                <button className="btn btn--inline" disabled>
                  Unavailable
                </button>
              )}
            </div>
          );
        })}
    </>
  );

  if (embedded) {
    return (
      <div className="card">
        <h2>Downloads</h2>
        {error && <p className="form-error">{error}</p>}
        {rows}
      </div>
    );
  }

  return (
    <>
      <div className="page-header">
        <h1>Downloads</h1>
        <p>
          {hasInstaller
            ? `The desktop app and ${guideWord}, ready whenever you need them.`
            : guideCount > 1
            ? "The guides, ready whenever you need them."
            : "Your guide, ready whenever you need it."}
        </p>
      </div>

      {error && <p className="form-error">{error}</p>}

      <div className="card">{rows}</div>
    </>
  );
}
