import { useAuth } from "../auth";
import PhoneNumber from "../components/PhoneNumber";

// "Who do I ring?" — one page, shared by the owner and the front desk.
//
// The answer is almost always the marketer who signed this gym up. They sat
// with the owner during setup, they know the gym, and they are the person
// whose phone already rings when something confuses somebody. Before this
// page existed that number lived in whatever WhatsApp thread it was first
// sent in, which is no use to a receptionist who was hired two months later.
//
// The contact comes off the GYM document, not the marketer's account. It has
// to: firestore.rules lets a gym read users belonging to that gym, and a
// marketer belongs to none, so the one person a gym most needs to reach is
// the one record it cannot read. Copying it onto the gym also means the
// number survives on the desk's local copy with no internet — which is
// exactly the moment somebody wants help.
//
// One component for both roles rather than two pages: the question and the
// answer are identical, and the only thing that differs is which guide to
// read first, which is one line.
export default function HelpPage() {
  const { gym, role } = useAuth();
  const isDesk = role === "receptionist";

  const name = gym?.affiliate_name;
  const phone = gym?.affiliate_phone;

  return (
    <>
      <div className="page-header">
        <h1>Help</h1>
        <p>Who to contact when something isn&rsquo;t working, or you aren&rsquo;t sure what to do.</p>
      </div>

      <div className="card">
        <h2>Your GymOS contact</h2>
        {name ? (
          <>
            <div className="detail-grid section-top">
              <div>
                <h4>Name</h4>
                <p>{name}</p>
              </div>
              <div>
                <h4>Phone</h4>
                <p>
                  {phone ? (
                    <PhoneNumber value={phone} />
                  ) : (
                    <span className="muted">Not recorded &mdash; ask your provider for it</span>
                  )}
                </p>
              </div>
            </div>
            <p className="muted hint">
              This is the person who set your gym up on GymOS. They know the software and they know
              your gym, so they are the fastest way to an answer.
            </p>
          </>
        ) : (
          <p className="muted section-top">
            No contact has been recorded for this gym yet. Until one is, go to whoever sold you
            GymOS &mdash; they can add it.
          </p>
        )}
      </div>

      <div className="card">
        <h2>Before you ring</h2>
        <p className="muted hint">
          Most questions are answered faster by the guide than by a phone call, and it works at
          2am.
        </p>
        <ul className="check section-top">
          <li>
            Open <strong>Downloads</strong> and read the{" "}
            {isDesk ? "front-desk guide" : "owner's guide"} &mdash; it covers every screen you have
          </li>
          {isDesk ? (
            <li>
              Anything about prices, plans, staff accounts or the gym&rsquo;s money is your
              owner&rsquo;s, not ours &mdash; ask them first
            </li>
          ) : (
            <li>
              If the whole app says the subscription has expired, that is billing &mdash; your
              contact above is who sorts it
            </li>
          )}
          <li>
            Have the member&rsquo;s name or number to hand if it is about one person &mdash; it
            makes the call a minute instead of ten
          </li>
        </ul>
      </div>

      <div className="card">
        <h2>What they can and can&rsquo;t do</h2>
        {/* Stated plainly so nobody spends a phone call asking for something
            that is not possible. A marketer genuinely cannot see inside a
            gym — that boundary is what makes signing up through one safe. */}
        <table className="table">
          <thead>
            <tr>
              <th>They can</th>
              <th>They can&rsquo;t</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Walk you through any screen</td>
              <td>See your members, money or attendance</td>
            </tr>
            <tr>
              <td>Sort out billing and renewals</td>
              <td>Undo a payment or a check-in</td>
            </tr>
            <tr>
              <td>Get a forgotten owner password reset</td>
              <td>Read anybody&rsquo;s password &mdash; nobody can</td>
            </tr>
          </tbody>
        </table>
      </div>
    </>
  );
}
