"use client";

/**
 * The bottom tab bar (revamp-app-shell). A minimal client island — the only part of the shell
 * that needs the current path — so the layout stays a server component. Renders ONLY on the
 * three top-level sections (Dashboard · Jobs · Settings); on a drilled-in job page it returns
 * null so the tab bar is hidden and the page's own back affordance leads out (the prototype's
 * drill-in model). The active tab carries `aria-current="page"`.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const TABS: { href: string; label: string; icon: ReactNode }[] = [
  { href: "/dashboard", label: "Dashboard", icon: <HomeIcon /> },
  { href: "/projects", label: "Jobs", icon: <JobsIcon /> },
  { href: "/settings", label: "Settings", icon: <GearIcon /> },
];

const TAB_PATHS = new Set(TABS.map((t) => t.href));

export function NavTabs() {
  const pathname = usePathname();
  // Drill-in pages (a job's hub/estimate/tools/…) are not tabs — hide the bar there.
  if (!TAB_PATHS.has(pathname)) return null;

  return (
    <nav
      aria-label="Primary"
      className="sticky bottom-0 grid grid-cols-3 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)]"
    >
      {TABS.map((t) => {
        const active = pathname === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={`flex min-h-[44px] flex-col items-center justify-center gap-0.5 py-2 text-xs ${
              active ? "font-semibold text-brand" : "text-muted"
            }`}
          >
            <span aria-hidden>{t.icon}</span>
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}

function HomeIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 10.5 12 4l9 6.5" />
      <path d="M5 9.5V20h14V9.5" />
    </svg>
  );
}

function JobsIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="7" width="18" height="13" rx="2" />
      <path d="M8 7V5.5A1.5 1.5 0 0 1 9.5 4h5A1.5 1.5 0 0 1 16 5.5V7" />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2.5v2.2M12 19.3v2.2M4.4 7l1.9 1.1M17.7 15.9l1.9 1.1M4.4 17l1.9-1.1M17.7 8.1l1.9-1.1" />
    </svg>
  );
}
