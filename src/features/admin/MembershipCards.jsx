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
  const [hint, setHint] = useState("");

  // Both buttons end at window.print(); only the sentence above it differs.
  // Telling somebody which destination to choose BEFORE the dialog covers
  // the screen is the whole value, because once it is open they cannot read
  // anything behind it.
  function printCards(mode) {
    setHint(
      mode === "pdf"
        ? "In the dialog that opens, set Destination to “Save as PDF”, then Save."
        : "In the dialog that opens, pick your printer. Print the front sheets, then put them back in and print the last sheet on the reverse."
    );
    // A tick, so the sentence is painted before print() freezes the page.
    setTimeout(() => window.print(), 60);
  }

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
          // EVERY member, active or not. A card is a physical object printed
          // in a batch and handed over weeks later; deciding who gets one
          // from today's active flag would mean somebody who lapsed for a
          // fortnight silently has no card when the box arrives. Who is
          // allowed in is decided at the door, every time, not by who holds
          // a piece of plastic.
          members
            .slice()
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
            <div className="page-actions">
              {/* Two buttons for one browser dialog, deliberately. Both open
                  the same print sheet — the browser has no separate "export
                  PDF" API — but which one you press decides what you pick as
                  the destination, and being told that in advance is the
                  difference between getting paper and getting a file. */}
              <button className="btn btn--primary btn--inline" onClick={() => printCards("print")}>
                Print
              </button>
              <button className="btn btn--inline" onClick={() => printCards("pdf")}>
                Save as PDF
              </button>
            </div>
          </div>
          <p className="muted hint">
            {cards.length === 0
              ? "This gym has no members yet."
              : `${cards.length} card${cards.length === 1 ? "" : "s"} across ${pages.length} sheet${
                  pages.length === 1 ? "" : "s"
                }, in the order members were registered. The last sheet is the back design — print it on the reverse.`}
          </p>
          <p className="muted hint">
            Members with no photo print with an empty photo box, so the card can still be issued and
            the photo added by hand. Lapsed members get a card too &mdash; entry is decided at the
            door, not by who holds one.
          </p>
          {hint && <p className="notice">{hint}</p>}
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
      {/* The whole decorative treatment as ONE full-bleed drawing rather than
          a strip along the bottom, because the design has marks at the top
          right as well — a faint grey arc and a green hairline behind the
          number — and they have to share a coordinate space with the sweep to
          stay in proportion.

          Inline SVG rather than the exported PNG so it stays sharp at print
          resolution and takes its greens from --accent. */}
      <svg className="mcard__art" viewBox="0 0 856 540" preserveAspectRatio="none" aria-hidden="true">
        {/* top right: pale arc, then the hairline over it */}
        <path d="M560 0 C 660 95, 770 150, 856 165 L856 0 Z" fill="#000" opacity="0.045" />
        <path
          d="M604 -6 C 688 76, 782 120, 856 132"
          stroke="var(--accent)"
          strokeWidth="3.5"
          fill="none"
          opacity="0.55"
        />
        {/* the sweep, back to front: grey wisp, bright green, a darker green
            edge, then the black blob the wordmark sits on */}
        <path d="M250 540 C 400 432, 590 424, 856 286 L856 540 Z" fill="#000" opacity="0.05" />
        <path d="M322 540 C 452 452, 632 440, 856 322 L856 540 Z" fill="var(--accent)" />
        <path d="M410 540 C 520 474, 676 462, 856 356 L856 540 Z" fill="#15803d" opacity="0.55" />
        <path d="M452 540 C 548 486, 692 474, 856 372 L856 540 Z" fill="#141414" />
      </svg>

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

        {/* Number directly above the photo and no "Gym No:" label: the label
            pushed the pill wider than the photo it sits on, which is what put
            this corner out of shape. The number reads as a number without
            being told. */}
        <div className="mcard__ident">
          <div className="mcard__no">{member.member_no}</div>
          <div className="mcard__photo">
            {member.photo_url ? (
              <img src={member.photo_url} alt="" />
            ) : (
              <>
                {/* The silhouette from the design, not a line of text on its
                    own: a card handed over with a blank grey box looks
                    unfinished, one with a placeholder figure looks like it is
                    waiting for a photo. */}
                <svg className="mcard__avatar" viewBox="0 0 64 64" aria-hidden="true">
                  <circle cx="32" cy="22" r="12" fill="#b9bcc0" />
                  <path d="M8 62 C 8 44, 20 37, 32 37 C 44 37, 56 44, 56 62 Z" fill="#b9bcc0" />
                </svg>
                <span className="mcard__photo-caption">YOUR PHOTO HERE</span>
              </>
            )}
          </div>
        </div>
      </div>

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
      {/* No logo mark beside the name. The watermark behind it is already
          the same mark at ten times the size; repeating it small next to the
          wordmark was the same shape twice in one glance. */}
      <div className="mcard__backbrand">
        <div className="mcard__gymname">{gym.name}</div>
        <div className="mcard__poweredby">
          POWERED BY <strong>GYMOS</strong>
        </div>
      </div>
      <div className="mcard__url">
        gymos.africa
        <span className="mcard__dash mcard__dash--under" aria-hidden="true" />
      </div>
    </div>
  );
}
