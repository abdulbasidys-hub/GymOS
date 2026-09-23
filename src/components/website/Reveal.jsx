import { useEffect, useRef, useState } from "react";

// Fades a block up as it comes into view. Used down the marketing pages so
// they arrive in sequence instead of landing as one flat wall of content.
//
// IntersectionObserver rather than a scroll listener: the browser does the
// work off the main thread, so this cannot make scrolling janky, which is
// the usual way "adding some animation" makes a site feel worse rather than
// better.
//
// It only ever fires ONCE per element, and unobserves immediately after.
// Content that re-animates every time you scroll past is the thing that
// makes a page feel like a toy, and it also means anyone scrolling back to
// re-read something watches it fade in again.
//
// Two deliberate safety valves:
//   - No IntersectionObserver (very old browsers, some embedded webviews):
//     the element starts visible. Never hide content behind a capability
//     the device might not have.
//   - prefers-reduced-motion is honoured in CSS rather than here, so the
//     element still becomes visible; it just does it without moving.
export default function Reveal({ children, delay = 0, as: Tag = "div", className = "" }) {
  const ref = useRef(null);
  const [shown, setShown] = useState(() => typeof IntersectionObserver === "undefined");

  useEffect(() => {
    if (shown || !ref.current) return;
    const el = ref.current;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          setShown(true);
          observer.unobserve(entry.target);
        }
      },
      // A little margin up from the bottom so a block is already settled by
      // the time it is properly on screen, rather than animating under the
      // reader's eye.
      { rootMargin: "0px 0px -8% 0px", threshold: 0.05 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [shown]);

  return (
    <Tag
      ref={ref}
      className={`reveal ${shown ? "reveal--in" : ""} ${className}`.trim()}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </Tag>
  );
}
