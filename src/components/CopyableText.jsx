import { useState } from "react";

// Any value worth copying rather than retyping — an account number, a
// reference. Same behaviour as PhoneNumber, which stays as it is because it
// is used in dozens of places and carries phone-specific wording; this is the
// general case rather than a refactor of a working thing.
//
// It exists for one reason: somebody transferring money reads an account
// number off one screen and types it into a banking app. A mistyped digit
// there does not bounce — it pays a stranger. Copying removes the retyping.
export default function CopyableText({ value, fallback = "Not set", className = "" }) {
  const [copied, setCopied] = useState(false);

  if (!value) return <span className="muted">{fallback}</span>;

  function copy(e) {
    e.stopPropagation();
    navigator.clipboard
      ?.writeText(value)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1400);
      })
      // Clipboard access can be refused (insecure context, permissions) and
      // that must not look like a crash. The value is on screen either way,
      // so the fallback is simply reading it.
      .catch(() => {});
  }

  return (
    <button type="button" className={`copyable ${className}`} onClick={copy} title="Click to copy">
      {value}
      <span className={`copyable__hint ${copied ? "copyable__hint--on" : ""}`}>
        {copied ? "Copied" : "Copy"}
      </span>
    </button>
  );
}
