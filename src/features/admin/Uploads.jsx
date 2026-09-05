import { useEffect, useState } from "react";
import {
  DOWNLOAD_KINDS,
  listDownloads,
  setDownloadLink,
  uploadDownload,
  removeDownload,
  logAdminActivity,
} from "../../data";
import { formatDateTime } from "../../lib/helpers";

// Publishes the desktop installer and the two role guides for customers to
// fetch themselves (features/DownloadsPage.jsx is what they see).
//
// Called "Uploads" here and "Downloads" there on purpose — it is the same
// files from the two opposite ends. The super admin puts them up; the gym
// takes them down. Naming this page for what the ADMIN does to it is what
// makes the sidebar read correctly.
//
// Each entry can be published EITHER by uploading the file to Firebase
// Storage OR by pasting a link to it somewhere else, and the choice is per
// entry on purpose. The guides are small PDFs and belong in Storage. The
// installer is ~120MB, and Storage's free tier allows 1GB of egress a day
// — roughly eight downloads before the project starts refusing them. A
// GitHub Release hosts the same file free and unmetered, so the "Link"
// option exists specifically for it. The customer's download button is
// identical either way; only who pays for the bandwidth changes.
function formatSize(bytes) {
  if (!bytes) return null;
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function KindEditor({ kind, entry, onChanged }) {
  const [mode, setMode] = useState("link");
  const [url, setUrl] = useState("");
  const [fileName, setFileName] = useState("");
  const [file, setFile] = useState(null);
  const [version, setVersion] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState("");

  useEffect(() => {
    setVersion(entry?.version || "");
    setNotes(entry?.notes || "");
  }, [entry?.version, entry?.notes]);

  async function publish(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (mode === "link") {
        if (!/^https?:\/\//i.test(url.trim())) {
          throw new Error("Enter a full link starting with http:// or https://");
        }
        await setDownloadLink(kind.id, { url, fileName, version, notes });
      } else {
        if (!file) throw new Error("Choose a file first.");
        setProgress("Uploading… this can take a while for large files.");
        await uploadDownload(kind.id, file, { version, notes });
      }
      await logAdminActivity({ activity: `Published download: ${kind.label}`, status: "Active" }).catch(() => {});
      setUrl("");
      setFileName("");
      setFile(null);
      onChanged();
    } catch (err) {
      setError(err?.message || "Couldn't publish this download.");
    } finally {
      setBusy(false);
      setProgress("");
    }
  }

  async function unpublish() {
    setBusy(true);
    setError("");
    try {
      await removeDownload(kind.id);
      await logAdminActivity({ activity: `Removed download: ${kind.label}`, status: "Removed" }).catch(() => {});
      onChanged();
    } catch (err) {
      setError(err?.message || "Couldn't remove this download.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <h2>{kind.label}</h2>
      <p className="muted hint">{kind.hint}</p>

      {entry ? (
        <p className="muted section-top">
          <strong>Published.</strong>{" "}
          {[
            entry.version && `Version ${entry.version}`,
            entry.file_name,
            formatSize(entry.size_bytes),
            entry.storage_path ? "Hosted on Firebase Storage" : "External link",
            entry.updated_at && `Updated ${formatDateTime(entry.updated_at)}`,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      ) : (
        <p className="muted section-top">Not published yet — customers see this as unavailable.</p>
      )}

      <form onSubmit={publish} className="section-top">
        <div className="tabs">
          <button
            type="button"
            className={`tab ${mode === "link" ? "active" : ""}`}
            onClick={() => setMode("link")}
          >
            Link
          </button>
          <button
            type="button"
            className={`tab ${mode === "upload" ? "active" : ""}`}
            onClick={() => setMode("upload")}
          >
            Upload
          </button>
        </div>

        {mode === "link" ? (
          <>
            <label className="field section-top">
              <span>Link to the file</span>
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://github.com/…/releases/download/v1.0.0/GymOS-Setup-1.0.0.exe"
              />
            </label>
            <label className="field">
              <span>File name shown to the customer (optional)</span>
              <input
                value={fileName}
                onChange={(e) => setFileName(e.target.value)}
                placeholder="GymOS Setup 1.0.0.exe"
              />
            </label>
          </>
        ) : (
          <label className="field section-top">
            <span>Choose a file</span>
            <input
              type="file"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </label>
        )}

        <div className="row2">
          <label className="field">
            <span>Notes shown under the title (optional)</span>
            <input value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>
          <label className="field">
            <span>Version (optional)</span>
            <input value={version} onChange={(e) => setVersion(e.target.value)} placeholder="1.0.0" />
          </label>
        </div>

        {error && <p className="form-error">{error}</p>}
        {progress && <p className="muted hint">{progress}</p>}

        <div className="section-top">
          <button className="btn btn--primary btn--inline" type="submit" disabled={busy}>
            {busy ? "Working…" : entry ? "Replace" : "Publish"}
          </button>
          {entry && (
            <button
              className="btn btn--inline"
              type="button"
              onClick={unpublish}
              disabled={busy}
              style={{ marginLeft: 10 }}
            >
              Unpublish
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

export default function Uploads() {
  const [entries, setEntries] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  function load() {
    setLoading(true);
    listDownloads()
      .then((rows) => setEntries(Object.fromEntries(rows.map((r) => [r.id, r]))))
      .catch(() => setError("Couldn't load downloads."))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  if (loading) return <p className="empty">Loading…</p>;

  return (
    <>
      <div className="page-header">
        <h1>Uploads</h1>
        <p>
          Files you publish for gyms to download themselves after signing in. Owners see the app and
          the owner&rsquo;s guide; receptionists see the app and the front-desk guide.
        </p>
      </div>

      {error && <p className="form-error">{error}</p>}

      {DOWNLOAD_KINDS.map((kind) => (
        <KindEditor key={kind.id} kind={kind} entry={entries[kind.id]} onChanged={load} />
      ))}
    </>
  );
}
