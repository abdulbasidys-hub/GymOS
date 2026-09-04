import { useEffect, useState } from "react";
import { useAuth } from "../auth";
import { DOWNLOAD_KINDS, listDownloads } from "../data";
import { formatDateTime } from "../lib/helpers";

// Self-service downloads for owners and receptionists: the desktop
// installer, and the PDF guide for whichever role is signed in. The point
// is that a customer who isn't sitting with the super admin can still get
// themselves set up — sign in through the browser, take the app and the
// guide, and go.
//
// One component for both roles rather than two near-identical pages: the
// only difference is WHICH entries are listed, which DOWNLOAD_KINDS.roles
// already describes. An owner sees the app plus the owner's guide (which
// covers the front desk too, so they can train their own staff); a
// receptionist sees the app plus the front-desk guide only.
function formatSize(bytes) {
  if (!bytes) return null;
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export default function DownloadsPage() {
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

  return (
    <>
      <div className="page-header">
        <h1>Downloads</h1>
        <p>
          {isElectron
            ? "Your guide, ready whenever you need it."
            : "The desktop app and your guide, ready whenever you need them."}
        </p>
      </div>

      {error && <p className="form-error">{error}</p>}

      <div className="card">
        {visible.map((kind) => {
          const entry = entries[kind.id];
          return (
            <div className="download-row" key={kind.id}>
              <div className="download-row__text">
                <h3>{kind.label}</h3>
                {entry ? (
                  <p className="muted">
                    {[
                      entry.version && `Version ${entry.version}`,
                      entry.file_name,
                      formatSize(entry.size_bytes),
                      entry.updated_at && `Updated ${formatDateTime(entry.updated_at)}`,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                ) : (
                  <p className="muted">Not available yet — check back shortly.</p>
                )}
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
      </div>
    </>
  );
}
