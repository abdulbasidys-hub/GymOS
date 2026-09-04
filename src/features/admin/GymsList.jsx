import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { listGyms, listOwners } from "../../data";
import Modal from "../../components/Modal";
import StatusBadge from "../../components/StatusBadge";
import { licenseStatus } from "../../logic/license";
import { capitalize } from "../../lib/helpers";
import NewGym from "./NewGym";

const FILTER_LABEL = { active: "Active", locked: "Locked" };

export default function GymsList() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const statusFilter = searchParams.get("status"); // "active" | "locked" | null

  const [gyms, setGyms] = useState([]);
  const [owners, setOwners] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    Promise.all([listGyms(), listOwners()])
      .then(([g, o]) => {
        if (!alive) return;
        setGyms(g);
        setOwners(o);
      })
      .catch(() => alive && setError("Couldn't load gyms."))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  const visibleGyms = statusFilter
    ? gyms.filter((g) => licenseStatus(g) === statusFilter)
    : gyms;

  return (
    <div className="card">
      <div className="status-block__head">
        <h2>Gyms</h2>
        <button className="btn btn--primary btn--inline" onClick={() => setModalOpen(true)}>
          Register a gym
        </button>
      </div>

      {statusFilter && (
        <p className="muted hint">
          Showing {FILTER_LABEL[statusFilter] || capitalize(statusFilter)} gyms only —{" "}
          <Link to="/admin/gyms">clear filter</Link>.
        </p>
      )}

      {error && <p className="form-error">{error}</p>}

      {loading ? (
        <p className="empty">Loading…</p>
      ) : visibleGyms.length === 0 ? (
        <p className="empty">
          {statusFilter ? `No ${FILTER_LABEL[statusFilter] || statusFilter} gyms.` : "No gyms yet. Register your first one."}
        </p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>#</th>
              <th>Name</th>
              <th>Prefix</th>
              <th>Owner</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {visibleGyms.map((g, i) => {
              const owner = owners.find((o) => (o.gym_ids ?? [o.gym_id]).includes(g.id)) || null;
              return (
                <tr
                  key={g.id}
                  className="row--expandable"
                  onClick={() => navigate(`/admin/gyms/${g.id}`)}
                >
                  <td className="muted">{i + 1}</td>
                  <td>{g.name}</td>
                  <td>{g.prefix}</td>
                  <td>{owner ? owner.name : <span className="muted">None</span>}</td>
                  <td>
                    <StatusBadge
                      active={g.status === "active"}
                      activeLabel="Active"
                      inactiveLabel="Suspended"
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Register a gym">
        <NewGym />
      </Modal>
    </div>
  );
}
