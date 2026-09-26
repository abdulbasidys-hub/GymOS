import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

// A small centered popup — backdrop click or Escape closes it, a click
// inside the card doesn't (stopPropagation). `state` tracks "open" |
// "closing" | "closed" rather than unmounting the instant `open` goes
// false, so the frosted card actually animates away (see the
// modal-card-out/modal-backdrop-out keyframes in index.css) instead of
// vanishing mid-frame. onAnimationEnd — not a hardcoded setTimeout — flips
// "closing" to "closed" once the CSS animation actually finishes, so it
// can't drift out of sync if the duration token changes later.
//
// Rendered via a portal into document.body rather than inline where it's
// triggered from. This isn't just tidiness: `.card` now carries a permanent
// backdrop-filter (the glass redesign), and per spec, `filter`/
// `backdrop-filter`/`transform`/`perspective`/`will-change` on an ancestor
// all create a containing block for `position:fixed` descendants — trapping
// this modal inside that card's small box instead of the viewport if it
// were left as a plain DOM child of whatever card triggered it (this is the
// exact same class of bug as the animation-fill-mode containing-block issue
// documented on .card's card-in animation below, just a different CSS
// property tripping the same spec rule). A portal sidesteps the problem
// permanently — no ancestor's CSS can ever trap this again, regardless of
// what properties get added to .card/.stat-card/etc. in the future.
export default function Modal({ open, onClose, title, children }) {
  const [state, setState] = useState(open ? "open" : "closed");

  useEffect(() => {
    if (open) setState("open");
    else setState((s) => (s === "closed" ? "closed" : "closing"));
  }, [open]);

  useEffect(() => {
    if (state !== "open") return;
    function onKey(e) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [state, onClose]);

  if (state === "closed") return null;

  // The guard matters. Animation events BUBBLE, so this fires for any
  // animation that finishes anywhere inside the modal — a .card's entry
  // animation, a spinner, anything a child re-render restarts. While the
  // modal is closing, the first child animation to finish would tear it down
  // mid-flight, which looks like the popup glitching rather than closing.
  // And because a re-render can restart a child animation at any moment, the
  // same event arrives at unpredictable times while the modal is simply
  // open. Only the card's OWN animation may end the close.
  function handleCardAnimationEnd(e) {
    if (e.target !== e.currentTarget) return;
    setState((s) => (s === "closing" ? "closed" : s));
  }

  return createPortal(
    <div
      className="modal-backdrop"
      data-state={state}
      // Ignored once closing: onClose usually resets the parent's form state,
      // and running that a second time while the card is animating out is
      // another way this looks like it is misbehaving.
      onClick={() => state === "open" && onClose()}
    >
      <div
        className="modal-card"
        data-state={state}
        onAnimationEnd={handleCardAnimationEnd}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-card__scroll">
          <div className="modal-card__head">
            <h2>{title}</h2>
            <button
              className="modal-card__close"
              type="button"
              onClick={() => state === "open" && onClose()}
              aria-label="Close"
            >
              ×
            </button>
          </div>
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
}
