import { useState } from "react";

// A phone number that copies itself to the clipboard when clicked — used
// everywhere a phone number is shown as read-only text (member/staff/owner/
// affiliate tables and detail views). stopPropagation matters here: most of
// these sit inside a clickable table row (row--expandable) that navigates
// elsewhere on click.
export default function PhoneNumber({ value, fallback = "—" }) {
  const [copied, setCopied] = useState(false);

  if (!value) return <span className="muted">{fallback}</span>;

  function copy(e) {
    e.stopPropagation();
    navigator.clipboard
      ?.writeText(value)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      })
      .catch(() => {});
  }

  return (
    <span className="phone-copy" onClick={copy} title="Click to copy">
      {copied ? "Copied!" : value}
    </span>
  );
}
