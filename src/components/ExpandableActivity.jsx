import { useState } from "react";

const PREVIEW_LIMIT = 10;

function toDateInputValue(d) {
  if (!d) return "";
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

// A table of dated entries that starts capped at 10 rows — "Show all"
// reveals the rest, and only then does a date filter appear (searching is
// only worth the UI cost once there's actually a long list to search).
// `dateOf` pulls a Date out of each entry; `columns`/`renderRow` let callers
// keep their own cell layout instead of this component knowing their shape.
export default function ExpandableActivity({ entries, dateOf, columns, renderRow, emptyText = "Nothing logged yet." }) {
  const [expanded, setExpanded] = useState(false);
  const [dateFilter, setDateFilter] = useState("");

  if (entries.length === 0) return <p className="empty">{emptyText}</p>;

  const filtered =
    expanded && dateFilter
      ? entries.filter((e) => toDateInputValue(dateOf(e)) === dateFilter)
      : entries;
  const visible = expanded ? filtered : entries.slice(0, PREVIEW_LIMIT);

  return (
    <>
      {expanded && (
        <div className="form-actions form-actions--row">
          <label className="field">
            <span>Filter by date</span>
            <input type="date" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} />
          </label>
          {dateFilter && (
            <button className="btn btn--inline" onClick={() => setDateFilter("")}>
              Clear
            </button>
          )}
        </div>
      )}

      {visible.length === 0 ? (
        <p className="empty">Nothing on that date.</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>{visible.map((entry, i) => renderRow(entry, i))}</tbody>
        </table>
      )}

      {entries.length > PREVIEW_LIMIT && (
        <div className="form-actions">
          <button className="btn btn--inline" onClick={() => setExpanded((v) => !v)}>
            {expanded ? "Show less" : `Show all (${entries.length})`}
          </button>
        </div>
      )}
    </>
  );
}
