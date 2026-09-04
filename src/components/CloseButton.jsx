// The only window control left (BUILD.md §15) — supersedes an earlier
// full custom title bar (logo/title row + minimize/maximize/close) per
// explicit follow-up request: no bar at all, window opens full screen by
// default (electron/main.cjs maximizes it before first show), and just
// this one floating control, not a dedicated top strip reserving layout
// space. Only rendered when window.gymOS.isElectron (App.jsx) — the web
// build keeps its normal browser chrome.

function CloseIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 10 10" fill="none">
      <path d="M0 0l10 10M10 0L0 10" stroke="currentColor" strokeWidth="1.25" />
    </svg>
  );
}

export default function CloseButton() {
  return (
    <button
      type="button"
      className="app-close-btn"
      onClick={() => window.gymOS.windowControls.close()}
      title="Close"
      aria-label="Close"
    >
      <CloseIcon />
    </button>
  );
}
