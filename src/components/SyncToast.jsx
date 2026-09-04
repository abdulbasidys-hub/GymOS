import { useEffect } from "react";
import { IconSync } from "./NavIcons";

const AUTO_DISMISS_MS = 4500;

// Manual-sync result feedback only (BUILD.md §15) — deliberately NOT shown
// for the automatic background sync (hourly interval, reconnect event):
// those run silently by design, success or failure, so a desk isn't
// interrupted by a popup every hour. Clicking "Sync now" is the one
// action that should get an explicit answer.
export default function SyncToast({ toast, onDismiss }) {
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(onDismiss, AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [toast, onDismiss]);

  if (!toast) return null;

  return (
    <div className={`sync-toast sync-toast--${toast.type}`} role="status" onClick={onDismiss}>
      <IconSync />
      <span>{toast.message}</span>
    </div>
  );
}
