import { useEffect } from "react";

// Makes every table in the app fit a phone screen, without any of the ~30
// pages that render one having to know about it.
//
// A table can't be made responsive by CSS alone: once the rows are broken
// out of the table layout, each cell has to carry its own column heading,
// and CSS has no way to read the <th> text into the <td>. So this walks
// the tables that are on screen and stamps what the stylesheet needs —
// data-label on every cell, plus a mode on the table itself:
//
//   data-fit    up to four columns. Wide enough to stay a real table on a
//               phone: cells wrap instead of scrolling sideways, and the
//               row-number column is dropped. A list of members stays
//               scannable ten at a time, which stacking would destroy.
//
//   data-stack  five columns or more. No amount of tightening fits seven
//               columns across 390px, so each row becomes its own block:
//               the identifying column as a heading, the rest as
//               label/value lines underneath.
//
// The stamped attributes are inert above the phone breakpoint — index.css
// only acts on them inside its own media query — so this runs everywhere
// and the desktop layout is untouched.
//
// Mounted once, inside the router in App.jsx (same reasoning as
// ActiveTabIntoView). Renders nothing.

// Below this many columns a table still fits; at it or above, it stacks.
const STACK_FROM = 5;

// Columns that identify nothing on their own. The row number is generated
// for display, and a member/gym number is not what anyone scans a list by
// — the name is. Used to pick which cell becomes a stacked row's heading.
const NOT_AN_IDENTITY = /^(#|.*\bnos?\.?|.*number|.*id)$/i;

function stamp(table) {
  const headCells = table.querySelectorAll("thead th");
  if (!headCells.length) return;
  const labels = Array.from(headCells, (th) => th.textContent.trim());

  const mode = labels.length >= STACK_FROM ? "data-stack" : "data-fit";
  if (!table.hasAttribute(mode)) {
    table.removeAttribute(mode === "data-stack" ? "data-fit" : "data-stack");
    table.setAttribute(mode, "");
  }

  // The heading for each stacked row. Falls back to the first column with
  // any text at all, so a table of nothing but numbers still gets one.
  let primary = labels.findIndex((l) => l && !NOT_AN_IDENTITY.test(l));
  if (primary === -1) primary = labels.findIndex((l) => l);

  // Headers are stamped too, so the row-number column can be hidden from
  // both the head and the body by one selector and the columns still line
  // up underneath each other.
  headCells.forEach((th, i) => setAttr(th, "data-label", labels[i]));

  table.querySelectorAll("tbody tr").forEach((tr) => {
    // An ExpandableRow's detail row is one cell spanning the whole table.
    // It has no column of its own and must not be given a label.
    if (tr.classList.contains("row__expanded")) return;
    Array.from(tr.children).forEach((cell, i) => {
      if (cell.colSpan > 1) return;
      setAttr(cell, "data-label", labels[i] ?? "");
      if (i === primary) setAttr(cell, "data-primary", "");
      else cell.removeAttribute("data-primary");
    });
  });
}

// Only writes when the value actually differs. Every write is a DOM
// mutation, and this runs from a MutationObserver.
function setAttr(el, name, value) {
  if (el.getAttribute(name) !== value) el.setAttribute(name, value);
}

export default function ResponsiveTables() {
  useEffect(() => {
    let queued = false;
    function run() {
      queued = false;
      document.querySelectorAll("table.table").forEach(stamp);
    }
    // Coalesce to one pass per frame: typing in a list's search box
    // re-renders every row, and re-stamping per mutation would do that
    // work dozens of times for one keystroke.
    function schedule() {
      if (queued) return;
      queued = true;
      requestAnimationFrame(run);
    }

    run();
    // Watches for rows and tables appearing: a route change, a search
    // filter, a "Show all" toggle, data arriving. Deliberately childList
    // only — this callback writes attributes, and observing those would
    // make it retrigger itself forever.
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  return null;
}
