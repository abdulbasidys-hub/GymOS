import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getGym, listMembers, listMembershipRecordsByGym } from "../../data";
import Logo from "../../components/Logo";
import { formatDate, toDate } from "../../lib/helpers";
import { currentRecord } from "../../logic/expiry";

// Printable membership cards for one gym — super-admin only, reached from a
// button on that gym's page. We print these and hand them over after the
// gym's first three months, so this screen exists to be printed, not browsed.
//
// EIGHT CARDS A PAGE, two across and four down. A card is CR80 (85.6 x 54mm),
// the same size as a bank card or a driving licence, which is what card
// printers, laminating pouches and wallets are all built around. The mockup
// in docs/ is drawn squarer than that; the visual design here follows it
// exactly, the proportions follow the standard.
const PER_PAGE = 8;

// Ordered the way the gym grew: member_no encodes the gym's own sequence
// (PREFIX-0001, PREFIX-0002...), so sorting on it is sorting by the order
// accounts were created, which is what was asked for. localeCompare with
// numeric beats a plain string sort, which would put -0010 before -0002.
function byMemberNumber(a, b) {
  return String(a.member_no ?? "").localeCompare(String(b.member_no ?? ""), undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

function chunk(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

export default function MembershipCards() {
  const { gymId } = useParams();
  const [gym, setGym] = useState(null);
  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    Promise.all([getGym(gymId), listMembers(gymId), listMembershipRecordsByGym(gymId)])
      .then(([g, members, records]) => {
        if (!alive) return;
        setGym(g);

        // One member's plan name comes from their current membership record.
        // Grouped in a Map first rather than filtering the whole list per
        // member — a gym with 1,000 members and years of records would
        // otherwise be a million passes for a page that is mostly layout.
        const byMember = new Map();
        for (const r of records) {
          if (!byMember.has(r.member_id)) byMember.set(r.member_id, []);
          byMember.get(r.member_id).push(r);
        }

        setCards(
          members
            .filter((m) => m.active !== false)
            .sort(byMemberNumber)
            .map((m) => ({
              member: m,
              // No current record is a real state — somebody registered whose
              // membership has lapsed — so the card says so rather than
              // printing a blank line.
              planName: currentRecord(byMember.get(m.id) ?? [])?.plan_name ?? null,
            }))
        );
      })
      .catch(() => alive && setError("Couldn't load this gym's members."))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [gymId]);

  if (loading) return <p className="empty">Loading…</p>;
  if (error) return <p className="form-error">{error}</p>;
  if (!gym) return <p className="empty">Gym not found.</p>;

  const pages = chunk(cards, PER_PAGE);

  return (
    <div className="cards-screen">
      {/* Everything in here is hidden when printing (index.css) so the paper
          holds cards and nothing else. */}
      <div className="cards-chrome">
        <Link className="back-link" to={`/admin/gyms/${gymId}`}>&larr; Back to {gym.name}</Link>

        <div className="card">
          <div className="status-block__head">
            <h2>Membership cards</h2>
            <button className="btn btn--primary btn--inline" onClick={() => window.print()}>
              Print / Save as PDF
            </button>
          </div>
          <p className="muted hint">
            {cards.length === 0
              ? "This gym has no active members yet."
              : `${cards.length} card${cards.length === 1 ? "" : "s"} across ${pages.length} sheet${
                  pages.length === 1 ? "" : "s"
                }, in the order members were registered. The last sheet is the back design — print it on the reverse.`}
          </p>
          <p className="muted hint">
            Members with no photo print with an empty photo box, so the card can still be issued and
            the photo added by hand.
          </p>
        </div>
      </div>

      {cards.length > 0 && (
        <>
          {pages.map((page, i) => (
            <div className="card-sheet" key={i}>
              {page.map(({ member, planName }) => (
                <CardFront key={member.id} member={member} planName={planName} gym={gym} />
              ))}
            </div>
          ))}

          {/* One sheet of backs, last, exactly as asked. Every back is
              identical, so a single sheet is all that is needed however many
              front sheets there are — print it on the reverse of each. */}
          <div className="card-sheet card-sheet--backs">
            {Array.from({ length: PER_PAGE }, (_, i) => (
              <CardBack key={i} gym={gym} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function CardFront({ member, planName, gym }) {
  const joined = toDate(member.date_joined) ?? toDate(member.created_at);
  return (
    <div className="mcard mcard--front">
      <div className="mcard__no">
        <span>Gym No:</span> <strong>{member.member_no}</strong>
      </div>

      <div className="mcard__body">
        <dl className="mcard__rows">
          <div>
            <dt>Name</dt>
            <dd className="mcard__name">{member.name}</dd>
          </div>
          <div>
            <dt>Phone Number</dt>
            <dd>{member.phone || "—"}</dd>
          </div>
          <div>
            <dt>Plan</dt>
            <dd>{planName || "—"}</dd>
          </div>
          <div>
            <dt>Reg Date</dt>
            <dd>{joined ? formatDate(joined) : "—"}</dd>
          </div>
          <div>
            <dt>Address</dt>
            <dd className="mcard__address">{member.address || "—"}</dd>
          </div>
        </dl>

        <div className="mcard__photo">
          {member.photo_url ? (
            <img src={member.photo_url} alt="" />
          ) : (
            <span className="mcard__photo-empty">YOUR PHOTO HERE</span>
          )}
        </div>
      </div>

      {/* The decorative sweep, as two stacked shapes rather than an image:
          it has to stay crisp at print resolution and recolour with the
          brand, and an exported PNG would do neither. */}
      <svg className="mcard__wave" viewBox="0 0 400 130" preserveAspectRatio="none" aria-hidden="true">
        <path d="M120 130 C 190 40, 300 95, 400 20 L400 130 Z" fill="var(--accent)" opacity="0.85" />
        <path d="M185 130 C 250 70, 330 110, 400 55 L400 130 Z" fill="#111" />
      </svg>

      <div className="mcard__tagline">
        <span className="mcard__dash" aria-hidden="true" />
        HEALTHIER PEOPLE
        <br />
        STRONGER TOMORROWS
      </div>

      <div className="mcard__powered">
        <span>Powered by</span>
        <strong>
          Gym<span>OS</span>
        </strong>
      </div>
    </div>
  );
}

function CardBack({ gym }) {
  return (
    <div className="mcard mcard--back">
      <div className="mcard__watermark" aria-hidden="true">
        <Logo size={150} iconOnly />
      </div>
      <div className="mcard__backbrand">
        <Logo size={26} iconOnly />
        <div>
          <div className="mcard__gymname">{gym.name}</div>
          <div className="mcard__poweredby">
            POWERED BY <strong>GYMOS</strong>
          </div>
        </div>
      </div>
      <div className="mcard__url">
        gymos.africa
        <span className="mcard__dash mcard__dash--under" aria-hidden="true" />
      </div>
    </div>
  );
}
