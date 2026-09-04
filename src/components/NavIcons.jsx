// Small line icons for sidebar nav links — purely decorative labels for
// routes that already exist, one per distinct nav destination across the
// four role shells (Desk/Owner/Admin/Affiliate). Same stroke style as the
// existing inline icons elsewhere (GearIcon, SearchIcon): 16x16, currentColor.

function base(children) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}

export function IconDashboard() {
  return base(
    <>
      <rect x="3" y="3" width="8" height="8" rx="1.5" />
      <rect x="13" y="3" width="8" height="5" rx="1.5" />
      <rect x="13" y="12" width="8" height="9" rx="1.5" />
      <rect x="3" y="15" width="8" height="6" rx="1.5" />
    </>
  );
}

export function IconPeople() {
  return base(
    <>
      <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 00-3-3.87" />
      <path d="M16 3.13a4 4 0 010 7.75" />
    </>
  );
}

export function IconCheckCircle() {
  return base(
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M8.5 12.5l2.5 2.5 4.5-5" />
    </>
  );
}

export function IconClipboard() {
  return base(
    <>
      <rect x="5" y="4" width="14" height="17" rx="2" />
      <path d="M9 4V3a1 1 0 011-1h4a1 1 0 011 1v1" />
      <path d="M8.5 12.5l2 2 5-5" />
    </>
  );
}

export function IconChart() {
  return base(
    <>
      <path d="M4 20V10" />
      <path d="M12 20V4" />
      <path d="M20 20v-7" />
    </>
  );
}

export function IconBadge() {
  return base(
    <>
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <circle cx="12" cy="10" r="3" />
      <path d="M8 17c.7-1.8 2.2-3 4-3s3.3 1.2 4 3" />
    </>
  );
}

export function IconGear() {
  return base(
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
    </>
  );
}

export function IconBuilding() {
  return base(
    <>
      <rect x="4" y="2" width="16" height="20" rx="1" />
      <path d="M9 8h1M14 8h1M9 12h1M14 12h1M9 16h1M14 16h1" />
      <path d="M9 21v-3h6v3" />
    </>
  );
}

export function IconCard() {
  return base(
    <>
      <rect x="2" y="5" width="20" height="15" rx="2" />
      <path d="M2 10h20" />
    </>
  );
}

export function IconSync() {
  return base(
    <>
      <path d="M21 12a9 9 0 01-15.3 6.4L3 16" />
      <path d="M3 12a9 9 0 0115.3-6.4L21 8" />
      <path d="M3 16v4h4" />
      <path d="M21 8V4h-4" />
    </>
  );
}

export function IconMegaphone() {
  return base(
    <>
      <path d="M3 11v2a2 2 0 002 2h1l3 5h2l-1-5h4l6 4V6l-6 4H6a2 2 0 00-2 2z" />
    </>
  );
}

export function IconPlus() {
  return base(
    <>
      <path d="M12 5v14M5 12h14" />
    </>
  );
}

export function IconDownload() {
  return base(
    <>
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </>
  );
}

export function IconLogout() {
  return base(
    <>
      <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </>
  );
}
