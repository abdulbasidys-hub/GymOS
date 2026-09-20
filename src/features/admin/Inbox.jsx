import { useEffect, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import {
  GYM_ENQUIRIES,
  AFFILIATE_APPLICATIONS,
  listGymEnquiries,
  listAffiliateApplications,
  setEnquiryHandled,
  applicantPhotoUrl,
  deleteEnquiry,
} from "../../data";
import PhoneNumber from "../../components/PhoneNumber";
import { formatDateTime } from "../../lib/helpers";

// Where everything a stranger sends us arrives: gyms asking about GymOS (the
// website Contact form) and people asking to sell it (Become an affiliate).
// Before this existed the contact form wrote nowhere at all — see the note at
// the top of features/website/Contact.jsx.
//
// Two tabs under one nav entry, the same shape as Marketers (roster /
// revenue). The two are answered in completely different ways — one is a
// reply, the other is a decision about a new account — but they arrive
// together and get checked together, so one destination with two views beats
// two nav entries that are each empty most of the time.
//
// "Handled" rather than "read": what matters is not whether these were
// opened, it is whether anybody actually got back to them. An enquiry can sit
// read and ignored for a week, which is the exact failure this page exists to
// prevent. It is also the only field super-admin can change
// (firestore.rules) — the sender's own words stay as they wrote them.
export default function Inbox({ tab = "gyms" }) {
  return tab === "affiliates" ? <AffiliateApplications /> : <GymEnquiries />;
}

function Tabs() {
  return (
    <div className="tabs">
      <NavLink to="/admin/inbox" end className={({ isActive }) => `tab ${isActive ? "active" : ""}`}>
        Gym enquiries
      </NavLink>
      <NavLink
        to="/admin/inbox/affiliates"
        className={({ isActive }) => `tab ${isActive ? "active" : ""}`}
      >
        Affiliate applications
      </NavLink>
    </div>
  );
}

/** Shared loader: both tabs are "fetch a list, act on one row, update it in
 *  place". Kept in one hook rather than duplicated, so the two tabs cannot
 *  drift in how they handle a failure. */
function useEnquiries(loader) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    loader()
      .then((r) => alive && setRows(r))
      .catch(() => alive && setError("Couldn't load these."))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  return { rows, setRows, loading, error, setError };
}

function GymEnquiries() {
  const { rows, setRows, loading, error, setError } = useEnquiries(listGymEnquiries);
  const [busyId, setBusyId] = useState(null);

  async function toggleHandled(row) {
    setBusyId(row.id);
    setError("");
    try {
      await setEnquiryHandled(GYM_ENQUIRIES, row.id, !row.handled);
      setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, handled: !r.handled } : r)));
    } catch {
      setError("Couldn't update that.");
    } finally {
      setBusyId(null);
    }
  }

  async function remove(row) {
    setBusyId(row.id);
    setError("");
    try {
      await deleteEnquiry(GYM_ENQUIRIES, row.id);
      setRows((prev) => prev.filter((r) => r.id !== row.id));
    } catch {
      setError("Couldn't delete that.");
    } finally {
      setBusyId(null);
    }
  }

  const waiting = rows.filter((r) => !r.handled);

  return (
    <>
      <Tabs />
      <div className="card">
        <div className="status-block__head">
          <h2>Gym enquiries</h2>
          {waiting.length > 0 && <span className="pill">{waiting.length} waiting</span>}
        </div>
        <p className="muted hint">
          Sent from the Contact page on the website. Reply by email or phone, then mark it handled so
          it stops counting as waiting.
        </p>

        {error && <div className="form-error">{error}</div>}

        {loading ? (
          <p className="empty">Loading&hellip;</p>
        ) : rows.length === 0 ? (
          <p className="empty">Nothing yet.</p>
        ) : (
          rows.map((r, i) => (
            <div className={`enquiry-row ${r.handled ? "enquiry-row--handled" : ""}`} key={r.id}>
              <div className="enquiry-row__text">
                <h3>
                  <span className="muted">{i + 1}.</span> {r.name} &middot; {r.gym_name}
                </h3>
                <p className="muted hint">
                  {formatDateTime(r.created_at)} &middot;{" "}
                  {/* mailto, because replying IS the action here and this
                      address is the only way back to them. */}
                  <a href={`mailto:${r.email}`}>{r.email}</a>
                </p>
                {/* Their own paragraphs are preserved (.enquiry-message sets
                    pre-wrap) — collapsing a long enquiry into one block makes
                    it unreadable. */}
                <p className="enquiry-message">{r.message}</p>
              </div>
              <div className="page-actions">
                <button
                  className="btn btn--inline"
                  onClick={() => toggleHandled(r)}
                  disabled={busyId === r.id}
                >
                  {r.handled ? "Mark unhandled" : "Mark handled"}
                </button>
                <button
                  className="btn btn--inline"
                  onClick={() => remove(r)}
                  disabled={busyId === r.id}
                >
                  Delete
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </>
  );
}

function AffiliateApplications() {
  const navigate = useNavigate();
  const { rows, setRows, loading, error, setError } = useEnquiries(listAffiliateApplications);
  const [busyId, setBusyId] = useState(null);
  // Photo URLs are resolved here, on render, because the document stores a
  // Storage PATH rather than a URL — the applicant has no read access to
  // resolve one themselves (data/enquiries.js explains why that is the safer
  // arrangement).
  const [photoUrls, setPhotoUrls] = useState({});

  useEffect(() => {
    let alive = true;
    for (const r of rows) {
      if (!r.photo_path || photoUrls[r.id] !== undefined) continue;
      applicantPhotoUrl(r.photo_path)
        .then((url) => alive && setPhotoUrls((prev) => ({ ...prev, [r.id]: url })))
        // A missing or unreadable photo must not break the row — the contact
        // details are the part that matters most.
        .catch(() => alive && setPhotoUrls((prev) => ({ ...prev, [r.id]: null })));
    }
    return () => {
      alive = false;
    };
  }, [rows]);

  async function toggleHandled(row) {
    setBusyId(row.id);
    setError("");
    try {
      await setEnquiryHandled(AFFILIATE_APPLICATIONS, row.id, !row.handled);
      setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, handled: !r.handled } : r)));
    } catch {
      setError("Couldn't update that.");
    } finally {
      setBusyId(null);
    }
  }

  async function remove(row) {
    setBusyId(row.id);
    setError("");
    try {
      await deleteEnquiry(AFFILIATE_APPLICATIONS, row.id, row.photo_path);
      setRows((prev) => prev.filter((r) => r.id !== row.id));
    } catch {
      setError("Couldn't delete that.");
    } finally {
      setBusyId(null);
    }
  }

  const waiting = rows.filter((r) => !r.handled);

  return (
    <>
      <Tabs />
      <div className="card">
        <div className="status-block__head">
          <h2>Affiliate applications</h2>
          {waiting.length > 0 && <span className="pill">{waiting.length} waiting</span>}
        </div>
        <p className="muted hint">
          Sent from Become an affiliate on the website. To accept somebody, register them as a
          marketer &mdash; that is what creates their account and temporary password &mdash; then
          mark the application handled.
        </p>

        {error && <div className="form-error">{error}</div>}

        {loading ? (
          <p className="empty">Loading&hellip;</p>
        ) : rows.length === 0 ? (
          <p className="empty">Nothing yet.</p>
        ) : (
          rows.map((r, i) => (
            <div className={`enquiry-row ${r.handled ? "enquiry-row--handled" : ""}`} key={r.id}>
              {photoUrls[r.id] ? (
                // A link, not just an image: a thumbnail is too small to judge
                // a photo by, and this is the file the welcome flier gets made
                // from, so it has to be openable at full size.
                <a href={photoUrls[r.id]} target="_blank" rel="noopener noreferrer">
                  <img className="enquiry-photo" src={photoUrls[r.id]} alt={`${r.name} sent this`} />
                </a>
              ) : (
                <div className="enquiry-photo enquiry-photo--empty" aria-hidden="true" />
              )}
              <div className="enquiry-row__text">
                <h3>
                  <span className="muted">{i + 1}.</span> {r.name}
                </h3>
                <p className="muted hint">
                  {formatDateTime(r.created_at)} &middot; <PhoneNumber value={r.phone} /> &middot;{" "}
                  <a href={`mailto:${r.email}`}>{r.email}</a>
                </p>
              </div>
              <div className="page-actions">
                <button
                  className="btn btn--primary btn--inline"
                  onClick={() => navigate("/admin/marketers")}
                  disabled={busyId === r.id}
                >
                  Register them
                </button>
                <button
                  className="btn btn--inline"
                  onClick={() => toggleHandled(r)}
                  disabled={busyId === r.id}
                >
                  {r.handled ? "Mark unhandled" : "Mark handled"}
                </button>
                <button
                  className="btn btn--inline"
                  onClick={() => remove(r)}
                  disabled={busyId === r.id}
                >
                  Delete
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </>
  );
}
