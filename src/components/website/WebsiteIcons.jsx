// Small line icons for the marketing site only — same 24px/currentColor/
// stroke-2 style as components/NavIcons.jsx, just for concepts the app
// shell never needed (bolt, handshake, arrow, block).

function base(children) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}

export function IconBolt() {
  return base(<path d="M13 2L4 14h6l-1 8 9-12h-6l1-8z" />);
}

export function IconDesk() {
  return base(
    <>
      <path d="M3 10h18" />
      <path d="M5 10V6a1 1 0 011-1h12a1 1 0 011 1v4" />
      <path d="M4 10v9M20 10v9" />
      <path d="M9 15h1M14 15h1" />
    </>
  );
}

export function IconHandshake() {
  return base(
    <>
      <path d="M2 12l4-4 4 3-3 3 3 3 3-3 4 4" />
      <path d="M14 8l4 4-4 4" />
      <path d="M6 8l3-3h3l3 3" />
    </>
  );
}

export function IconBlock() {
  return base(
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M5.5 5.5l13 13" />
    </>
  );
}

export function IconArrowRight() {
  return base(
    <>
      <path d="M5 12h14" />
      <path d="M13 6l6 6-6 6" />
    </>
  );
}

export function IconCheckSmall() {
  return base(<path d="M5 13l4 4 10-10" />);
}
