import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { listOwners, getGym } from "../../data";
import SubscriptionModal from "./SubscriptionModal";
import { licenseStatus, daysRemaining } from "../../logic/license";
import { formatDate, capitalize } from "../../lib/helpers";

// One subscription per OWNER now (BUILD.md §6) — covers every branch they
// manage, not one gym. Rows are owner accounts, not gyms; per-branch
// suspend/reactivate status stays on GymsList.jsx/GymDetailPage.jsx, a
// different, independent dimension from billing.
export default function Subscriptions() {
  const [searchParams] = useSearchParams();
  const focusOwnerId = searchParams.get("owner");

  const [owners, setOwners] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedOwnerId, setSelectedOwnerId] = useState(focusOwnerId);
  const [primaryGym, setPrimaryGym] = useState(null);

  useEffect(() => {
    let alive = true;
    listOwners()
      .then((o) => alive && setOwners(o))
      .catch(() => alive && setError("Couldn't load subscriptions."))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  function patchOwner(ownerId, patch) {
    setOwners((prev) => prev.map((o) => (o.id === ownerId ? { ...o, ...patch } : o)));
  }

  const selectedOwner = owners.find((o) => o.id === selectedOwnerId) || null;

  // Only needed for the modal's affiliate attribution (BUILD.md §6) — not
  // worth fetching every owner's primary gym up front for the table.
  useEffect(() => {
    if (!selectedOwner?.gym_id) {
      setPrimaryGym(null);
      return;
    }
    let alive = true;
    getGym(selectedOwner.gym_id)
      .then((g) => alive && setPrimaryGym(g))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [selectedOwner?.gym_id]);

  const now = new Date();
  const withStatus = owners.map((o) => ({
    owner: o,
    branchCount: o.gym_ids?.length ?? (o.gym_id ? 1 : 0),
    status: licenseStatus({ status: "active", subscription: o.subscription }, now),
    remaining: daysRemaining(o.subscription?.expiry_date, now),
  }));
  const counts = {
    active: withStatus.filter((x) => x.status === "active").length,
    grace: withStatus.filter((x) => x.status === "grace").length,
    expired: withStatus.filter((x) => x.status === "expired" || x.status === "locked").length,
    expiringSoon: withStatus.filter((x) => x.status === "active" && x.remaining != null && x.remaining <= 7).length,
  };

  return (
    <>
      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-card__label">Active</div>
          <div className="stat-card__value">{counts.active}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card__label">In grace</div>
          <div className="stat-card__value">{counts.grace}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card__label">Expired / locked</div>
          <div className="stat-card__value">{counts.expired}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card__label">Expiring within 7 days</div>
          <div className={`stat-card__value ${counts.expiringSoon > 0 ? "stat-card__value--warn" : ""}`}>
            {counts.expiringSoon}
          </div>
        </div>
      </div>

      <div className="card">
        <h2>Subscriptions</h2>
        {error && <p className="form-error">{error}</p>}
        {loading ? (
          <p className="empty">Loading…</p>
        ) : owners.length === 0 ? (
          <p className="empty">No owners yet.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>#</th>
                <th>Owner</th>
                <th>Branches</th>
                <th>Plan</th>
                <th>Status</th>
                <th>Expires</th>
                <th>Days</th>
              </tr>
            </thead>
            <tbody>
              {withStatus.map(({ owner, branchCount, status, remaining }, i) => (
                <tr key={owner.id} className="row--expandable" onClick={() => setSelectedOwnerId(owner.id)}>
                  <td className="muted">{i + 1}</td>
                  <td>{owner.name}</td>
                  <td className="muted">{branchCount}</td>
                  <td>{owner.subscription?.plan_name || <span className="muted">—</span>}</td>
                  <td>
                    <strong className={`status-text status-text--${status}`}>{capitalize(status)}</strong>
                  </td>
                  <td>{owner.subscription?.expiry_date ? formatDate(owner.subscription.expiry_date) : "—"}</td>
                  <td>{remaining == null ? "—" : remaining >= 0 ? `${remaining}d left` : `${Math.abs(remaining)}d overdue`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <SubscriptionModal
        owner={selectedOwner}
        primaryGym={primaryGym}
        open={!!selectedOwner}
        onClose={() => setSelectedOwnerId(null)}
        onOwnerChange={(patch) => patchOwner(selectedOwnerId, patch)}
      />
    </>
  );
}
