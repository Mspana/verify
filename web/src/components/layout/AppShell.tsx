import { useEffect, useState, type ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { Clock, ScanLine, User } from "lucide-react";

import { getHealth, postSession } from "../../lib/api";
import { ToastProvider } from "../ui/Toast";

// Mobile: bottom tab bar stuck to the bottom edge.
// Desktop (md+): 200px left sidebar with paper-alt bg; active nav
// inverts to paper + cobalt. lucide icons pick up the text color for
// their stroke via currentColor, so setting text-cobalt on the
// NavLink makes both label and icon cobalt in the active state.

type NavItem = {
  to: string;
  icon: typeof ScanLine;
  primary: string;
  secondary?: string;
};

const NAV: NavItem[] = [
  { to: "/", icon: ScanLine, primary: "Scan" },
  { to: "/history", icon: Clock, primary: "History" },
  { to: "/account", icon: User, primary: "Account" },
];

const HEALTH_POLL_MS = 60_000;

export function AppShell({ children }: { children: ReactNode }) {
  const [healthy, setHealthy] = useState(true);

  useEffect(() => {
    void postSession().catch(() => {});

    let cancelled = false;
    const probe = () => {
      getHealth()
        .then(() => !cancelled && setHealthy(true))
        .catch(() => !cancelled && setHealthy(false));
    };
    probe();
    const id = window.setInterval(probe, HEALTH_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  return (
    <ToastProvider>
      <div className="min-h-full flex flex-col md:flex-row bg-paper text-ink">
        <Sidebar />
        <div className="flex-1 flex flex-col min-w-0">
          {!healthy && <DegradedBanner />}
          <main className="flex-1 pb-[72px] md:pb-0">{children}</main>
        </div>
        <BottomTabs />
      </div>
    </ToastProvider>
  );
}

function BrandBlock() {
  return (
    <div className="flex items-center gap-[9px]">
      <div
        aria-hidden
        className="flex h-6 w-6 items-center justify-center rounded-[7px] bg-cobalt text-[12px] font-medium text-paper"
      >
        眼
      </div>
      <div className="text-[15px] font-medium leading-none">
        真伪 <span className="opacity-70">·</span> Verify
      </div>
    </div>
  );
}

function Sidebar() {
  return (
    <aside className="hidden md:flex md:w-[200px] md:flex-col md:gap-[3px] md:bg-paper-alt md:px-[14px] md:py-5">
      <div className="px-2.5 pb-[22px] pt-1.5">
        <BrandBlock />
      </div>
      <nav className="flex flex-col gap-[3px]">
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/"}
            className={({ isActive }) =>
              [
                "flex items-center gap-[10px] rounded-btn px-3 py-[9px] text-[13px] transition-colors",
                isActive
                  ? "bg-paper text-cobalt font-medium"
                  : "text-ink/75 hover:bg-paper",
              ].join(" ")
            }
          >
            {({ isActive }) => (
              <>
                <item.icon
                  className={[
                    "h-4 w-4 flex-shrink-0",
                    isActive ? "" : "opacity-60",
                  ].join(" ")}
                  strokeWidth={1.5}
                  aria-hidden
                />
                <span>{item.primary}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}

function BottomTabs() {
  return (
    <nav
      aria-label="Primary"
      className="md:hidden fixed bottom-0 inset-x-0 z-20 border-t border-border bg-paper/95 backdrop-blur"
    >
      <ul className="grid grid-cols-3 pb-[max(env(safe-area-inset-bottom),12px)] pt-3 px-5">
        {NAV.map((item) => (
          <li key={item.to}>
            <NavLink
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) =>
                [
                  "flex flex-col items-center justify-center gap-[3px]",
                  isActive
                    ? "text-cobalt font-medium"
                    : "text-ink/55",
                ].join(" ")
              }
            >
              <item.icon className="h-[18px] w-[18px]" strokeWidth={1.5} aria-hidden />
              <span className="text-[10px]">{item.primary}</span>
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function DegradedBanner() {
  return (
    <div
      role="status"
      className="bg-uncertain-fill text-uncertain-ink border-b border-uncertain-accent/30 px-4 py-2 text-sm"
    >
      Scanning is temporarily unavailable. Existing scans can still be viewed.
    </div>
  );
}
