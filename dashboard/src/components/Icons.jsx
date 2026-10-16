export function IconMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M8 2.5 14 13.5H2L8 2.5Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M8 6.5v3.2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="8" cy="11.4" r="0.7" fill="currentColor" />
    </svg>
  );
}

export function IconBoard() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="2" y="2.5" width="5" height="11" rx="1.2" stroke="currentColor" strokeWidth="1.3" />
      <rect x="9" y="2.5" width="5" height="7" rx="1.2" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}

export function IconChart() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M2.5 13h11" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M4 13V8.5M8 13V4.5M12 13V7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function IconBook() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M3 3.2h7.2A2.3 2.3 0 0 1 12.5 5.5v7.3H5.3A2.3 2.3 0 0 0 3 15"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
      <path d="M3 3.2v11.8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

export function IconMenu() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

export function IconClose() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

export function IconBack() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M10 3.5 4.5 8 10 12.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Svg({ children, size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      {children}
    </svg>
  );
}

const stroke = { stroke: "currentColor", strokeWidth: 1.4, strokeLinecap: "round", strokeLinejoin: "round" };

export function IconInbox({ size }) {
  return (
    <Svg size={size}>
      <path d="M2.5 9.5 4 3.5h8l1.5 6v3h-11v-3Z" {...stroke} />
      <path d="M2.5 9.5h3l1 1.5h3l1-1.5h3" {...stroke} />
    </Svg>
  );
}

export function IconQueue({ size }) {
  return (
    <Svg size={size}>
      <path d="M3 4h10M3 8h10M3 12h6" {...stroke} />
    </Svg>
  );
}

export function IconSearch({ size }) {
  return (
    <Svg size={size}>
      <circle cx="7" cy="7" r="4" {...stroke} />
      <path d="m10 10 3.5 3.5" {...stroke} />
    </Svg>
  );
}

export function IconSparkle({ size }) {
  return (
    <Svg size={size}>
      <path d="M8 2.5 9.3 6.7 13.5 8 9.3 9.3 8 13.5 6.7 9.3 2.5 8 6.7 6.7 8 2.5Z" {...stroke} />
    </Svg>
  );
}

export function IconBranch({ size }) {
  return (
    <Svg size={size}>
      <circle cx="4" cy="3.5" r="1.5" {...stroke} />
      <circle cx="4" cy="12.5" r="1.5" {...stroke} />
      <circle cx="12" cy="6" r="1.5" {...stroke} />
      <path d="M4 5v6M12 7.5c0 2.5-3 2.5-8 3.5" {...stroke} />
    </Svg>
  );
}

export function IconUserCheck({ size }) {
  return (
    <Svg size={size}>
      <circle cx="6.5" cy="5" r="2.5" {...stroke} />
      <path d="M2 13.5c.6-2.4 2.3-3.5 4.5-3.5 1 0 1.9.2 2.6.7" {...stroke} />
      <path d="m10.5 12 1.5 1.5 2.5-3" {...stroke} />
    </Svg>
  );
}

export function IconCheck({ size }) {
  return (
    <Svg size={size}>
      <path d="m3.5 8.5 3 3 6-7" {...stroke} strokeWidth={1.8} />
    </Svg>
  );
}

export function IconX({ size }) {
  return (
    <Svg size={size}>
      <path d="m4.5 4.5 7 7M11.5 4.5l-7 7" {...stroke} strokeWidth={1.8} />
    </Svg>
  );
}

export function IconHelp({ size }) {
  return (
    <Svg size={size}>
      <circle cx="8" cy="8" r="5.8" {...stroke} />
      <path d="M6.3 6.3a1.8 1.8 0 1 1 2.4 1.7c-.5.2-.7.6-.7 1.1v.3" {...stroke} />
      <circle cx="8" cy="11.4" r="0.6" fill="currentColor" />
    </Svg>
  );
}

export function IconReplay({ size }) {
  return (
    <Svg size={size}>
      <path d="M3 8a5 5 0 1 0 1.5-3.6" {...stroke} />
      <path d="M3 2.8v2.6h2.6" {...stroke} />
    </Svg>
  );
}

export function IconKanban({ size }) {
  return (
    <Svg size={size}>
      <rect x="2" y="2.5" width="3.4" height="11" rx="1" {...stroke} />
      <rect x="6.3" y="2.5" width="3.4" height="7.5" rx="1" {...stroke} />
      <rect x="10.6" y="2.5" width="3.4" height="9.5" rx="1" {...stroke} />
    </Svg>
  );
}

export function IconCalendar({ size }) {
  return (
    <Svg size={size}>
      <rect x="2.5" y="3.5" width="11" height="10" rx="1.5" {...stroke} />
      <path d="M2.5 6.5h11M5.5 2v3M10.5 2v3" {...stroke} />
    </Svg>
  );
}

export function IconComment({ size }) {
  return (
    <Svg size={size}>
      <path d="M3 3.5h10v7H7l-3 2.5v-2.5H3v-7Z" {...stroke} />
    </Svg>
  );
}

export function IconPlus({ size }) {
  return (
    <Svg size={size}>
      <path d="M8 3v10M3 8h10" {...stroke} strokeWidth={1.7} />
    </Svg>
  );
}

export function IconPlay({ size }) {
  return (
    <Svg size={size}>
      <path d="M5 3.5v9l7-4.5-7-4.5Z" {...stroke} />
    </Svg>
  );
}
