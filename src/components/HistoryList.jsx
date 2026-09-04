// A generic history list (payments, attendance, activity) — the caller
// decides how each item renders; this just handles the empty state and
// consistent row layout.
export default function HistoryList({ items, renderItem, emptyText = "No history yet." }) {
  if (!items || items.length === 0) return <p className="empty">{emptyText}</p>;
  return (
    <ul className="history">
      {items.map((item, i) => (
        <li className="history__item" key={item.id ?? i}>
          {renderItem(item)}
        </li>
      ))}
    </ul>
  );
}
