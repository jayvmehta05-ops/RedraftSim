/** Small inline icon set (stroke icons, 24px grid) so the app has no icon-font dependency. */
type P = { className?: string };
const base = "h-5 w-5";
const svg = (d: React.ReactNode, className?: string) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"
    className={className ?? base} aria-hidden>
    {d}
  </svg>
);

export const IconBoard = ({ className }: P) => svg(<><path d="M4 6h16M4 12h16M4 18h10" /></>, className);
export const IconMock = ({ className }: P) => svg(<><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><path d="M14 17.5h7M17.5 14v7" /></>, className);
export const IconLive = ({ className }: P) => svg(<><circle cx="12" cy="12" r="2.5" /><path d="M7.8 7.8a6 6 0 0 0 0 8.4M16.2 7.8a6 6 0 0 1 0 8.4M5 5a10 10 0 0 0 0 14M19 5a10 10 0 0 1 0 14" /></>, className);
export const IconKeeper = ({ className }: P) => svg(<><path d="M6 4h12v16l-6-4-6 4z" /></>, className);
export const IconTrend = ({ className }: P) => svg(<><path d="M3 17l6-6 4 4 8-8" /><path d="M15 7h6v6" /></>, className);
export const IconSwap = ({ className }: P) => svg(<><path d="M4 8h13l-3-3M20 16H7l3 3" /></>, className);
export const IconSettings = ({ className }: P) => svg(<><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2" /><circle cx="10" cy="17" r="2" /></>, className);
export const IconClose = ({ className }: P) => svg(<path d="M6 6l12 12M18 6L6 18" />, className);
export const IconArrow = ({ className }: P) => svg(<path d="M5 12h14M13 6l6 6-6 6" />, className);
export const IconImport = ({ className }: P) => svg(<><path d="M12 3v12M7 10l5 5 5-5" /><path d="M5 21h14" /></>, className);

/** Brand mark: goalposts inside a rounded tile. */
export function Logo({ className = "h-8 w-8" }: P) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <rect width="32" height="32" rx="8" fill="#10b981" />
      <path d="M9 7v9h14V7M16 16v10" stroke="#022c22" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}
export const IconLock = ({ className }: P) => svg(<><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>, className);
export const IconUnlock = ({ className }: P) => svg(<><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 7.5-2" /></>, className);
