import { useEffect, useState, type ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { Clock, ScanLine, User } from "lucide-react";

import { getHealth, postSession } from "../../lib/api";

type NavItem = {
  to: string;
  icon: typeof ScanLine;
  primary: string;
  secondary?: string;
};

const NAV: NavItem[] = [
  { to: "/", icon: ScanLine, primary: "扫描", secondary: "Scan" },
  { to: "/history", icon: Clock, primary: "History" },
  { to: "/account", icon: User, primary: "Account" },
];

const HEALTH_POLL_MS = 60_000;

export function AppShell({ children }: { children: ReactNode }) {
  const [healthy, setHealthy] = useState(true);

  // Session + health fire in parallel on mount. Initial healthy=true prevents
  // the degraded banner from flashing before the first health probe returns.
  // Session doesn't block rendering — the cookie ride-along from the Worker
  // lands as a Set-Cookie on the response either way.
  useEffect(() => {
    void postSession().catch(() => {
      // Silent: session is idempotent on our side and the Worker's session
      // middleware mints a cookie on every /api/* request regardless. A
      // failure here means the Worker is unreachable, which the health
      // probe below will surface via the degraded banner.
    });

    let cancelled = false;
    const probe = () => {
      getHealth()
        .then(() => {
          if (!cancelled) setHealthy(true);
        })
        .catch(() => {
          if (!cancelled) setHealthy(false);
        });
    };
    probe();
    const id = window.setInterval(probe, HEALTH_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  return (
    <div className="min-h-full flex flex-col md:flex-row bg-paper text-ink">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        {!healthy && <DegradedBanner />}
        <main className="flex-1 pb-20 md:pb-0">{children}</main>
      </div>
      <BottomTabs />
    </div>
  );
}

function Sidebar() {
  return (
    <aside className="hidden md:flex md:w-[180px] md:flex-col md:border-r md:border-paper-edge md:px-4 md:py-6">
      <div className="mb-8 px-2">
        <div className="text-lg font-semibold leading-tight">真伪</div>
        <div className="text-sm text-ink-muted leading-tight">Verify</div>
      </div>
      <nav className="flex flex-col gap-1">
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/"}
            className={({ isActive }) =>
              [
                "flex items-center gap-3 rounded-btn px-3 py-2 text-sm transition-colors",
                isActive
                  ? "bg-ink text-paper"
                  : "text-ink hover:bg-paper-edge",
              ].join(" ")
            }
          >
            <item.icon className="h-4 w-4" aria-hidden />
            <span>
              {item.secondary ? (
                <>
                  <span className="font-medium">{item.primary}</span>{" "}
                  <span className="text-ink-muted">· {item.secondary}</span>
                </>
              ) : (
                item.primary
              )}
            </span>
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
      className="md:hidden fixed bottom-0 inset-x-0 z-20 border-t border-paper-edge bg-paper/95 backdrop-blur"
    >
      <ul className="grid grid-cols-3">
        {NAV.map((item) => (
          <li key={item.to}>
            <NavLink
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) =>
                [
                  "flex flex-col items-center justify-center gap-1 py-3 text-xs",
                  isActive ? "text-ink" : "text-ink-muted",
                ].join(" ")
              }
            >
              <item.icon className="h-5 w-5" aria-hidden />
              <span>
                {item.secondary ? `${item.primary} · ${item.secondary}` : item.primary}
              </span>
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
      className="bg-uncertain-fill text-uncertain-accent border-b border-uncertain-accent/30 px-4 py-2 text-sm"
    >
      Scanning is temporarily unavailable. Existing scans can still be viewed.
    </div>
  );
}
