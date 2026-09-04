import { useEffect, useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { listAllAffiliateEarnings, listAffiliates, markAffiliateEarningsPaid } from "../../data";
import Modal from "../../components/Modal";
import { naira } from "../../lib/helpers";

function csvCell(value) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function downloadCsv(filename, text) {
  const blob = new Blob([text], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// What GymOS owes its marketers — separate from admin/Revenue.jsx, which is
// the gross amount gyms paid the platform (unaffected by any commission
// split). Pay these out at the end of each month, then "Mark as paid" to
// close the period — earnings already paid stay in history but drop out of
// the pending total.
export default function MarketersRevenue() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    Promise.all([listAllAffiliateEarnings(), listAffiliates()])
      .then(([earnings, affiliates]) => {
        if (!alive) return;
        const byAffiliate = new Map(
          affiliates.map((a) => [
            a.id,
            {
              affiliateId: a.id,
              name: a.name,
              bankName: a.bank_name,
              accountNumber: a.account_number,
              pending: 0,
              paidAllTime: 0,
            },
          ])
        );
        for (const e of earnings) {
          const entry = byAffiliate.get(e.affiliate_id);
          if (!entry) continue; // marketer account since removed — skip
          if (e.status === "paid") entry.paidAllTime += Number(e.earned_amount) || 0;
          else entry.pending += Number(e.earned_amount) || 0;
        }
        setRows([...byAffiliate.values()].sort((a, b) => b.pending - a.pending));
      })
      .catch(() => alive && setError("Couldn't load marketer revenue."))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  // One bulk close-out for the whole period, not a per-row action — export
  // the CSV, actually send the transfers outside GymOS, THEN confirm here.
  // Marks every marketer with a pending balance as paid in one pass; each
  // one's next platform payment still opens a fresh pending balance same as
  // always (recordAffiliateEarning always starts a new earning at "pending"
  // — nothing about closing out this period changes that).
  async function markAllPaid() {
    setBusy(true);
    setError("");
    setConfirmOpen(false);
    try {
      const toPay = rows.filter((r) => r.pending > 0);
      await Promise.all(toPay.map((r) => markAffiliateEarningsPaid(r.affiliateId)));
      setRows((prev) => prev.map((r) => (r.pending > 0 ? { ...r, paidAllTime: r.paidAllTime + r.pending, pending: 0 } : r)));
    } catch {
      setError("Couldn't mark payouts as paid.");
    } finally {
      setBusy(false);
    }
  }

  function exportCsv() {
    const header = ["Name", "Bank", "Account number", "Pending earnings (NGN)"];
    const lines = [header.map(csvCell).join(",")];
    for (const r of rows) {
      lines.push([r.name, r.bankName || "", r.accountNumber || "", r.pending].map(csvCell).join(","));
    }
    downloadCsv(`marketer-payouts-${new Date().toISOString().slice(0, 10)}.csv`, lines.join("\n"));
  }

  const toPayOutThisMonth = rows.reduce((sum, r) => sum + r.pending, 0);
  const paidAllTime = rows.reduce((sum, r) => sum + r.paidAllTime, 0);

  return (
    <>
      <div className="tabs">
        <NavLink to="/admin/marketers" end className={({ isActive }) => `tab ${isActive ? "active" : ""}`}>
          Marketers
        </NavLink>
        <NavLink to="/admin/marketers/revenue" className={({ isActive }) => `tab ${isActive ? "active" : ""}`}>
          Revenue
        </NavLink>
      </div>

      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-card__label">To pay out this month</div>
          <div className="stat-card__value">{naira(toPayOutThisMonth)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card__label">Paid all-time</div>
          <div className="stat-card__value">{naira(paidAllTime)}</div>
        </div>
      </div>

      <div className="card">
        <div className="status-block__head">
          <h2>Payouts</h2>
          <div className="page-actions">
            <button className="btn btn--inline" onClick={exportCsv} disabled={rows.length === 0}>
              Export CSV
            </button>
            <button
              className="btn btn--inline btn--primary"
              onClick={() => setConfirmOpen(true)}
              disabled={toPayOutThisMonth === 0 || busy}
            >
              {busy ? "Marking…" : "Mark all as paid"}
            </button>
          </div>
        </div>
        <p className="muted hint">Export and pay marketers at the end of each month, then mark them paid to close the period.</p>

        {error && <div className="form-error">{error}</div>}

        {loading ? (
          <p className="empty">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="empty">No marketers yet.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>#</th>
                <th>Name</th>
                <th>Bank</th>
                <th>Account number</th>
                <th>Pending</th>
                <th>Paid all-time</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.affiliateId}>
                  <td className="muted">{i + 1}</td>
                  <td>
                    <Link to={`/admin/marketers/${r.affiliateId}`}>{r.name}</Link>
                  </td>
                  <td>{r.bankName || <span className="muted">Not provided</span>}</td>
                  <td>{r.accountNumber || <span className="muted">Not provided</span>}</td>
                  <td>{naira(r.pending)}</td>
                  <td className="muted">{naira(r.paidAllTime)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Modal open={confirmOpen} onClose={() => setConfirmOpen(false)} title="Confirm payout">
        <p>
          Have you already sent this month's payment to every marketer listed? This marks{" "}
          <strong>{naira(toPayOutThisMonth)}</strong> as paid across {rows.filter((r) => r.pending > 0).length}{" "}
          marketer(s) and resets their pending balance to zero — new earnings still accrue normally from here.
        </p>
        <div className="form-actions form-actions--row">
          <button className="btn btn--inline btn--primary" onClick={markAllPaid} disabled={busy}>
            {busy ? "Marking…" : "Yes, mark as paid"}
          </button>
          <button className="btn btn--inline" onClick={() => setConfirmOpen(false)} disabled={busy}>
            Cancel
          </button>
        </div>
      </Modal>
    </>
  );
}
