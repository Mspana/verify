import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, NavLink } from "react-router-dom";
import { Clock, ScanLine, User } from "lucide-react";
import { useTranslation } from "react-i18next";

import { postSession } from "../../lib/api";
import { ERROR_UX } from "../../lib/errors";
import { HealthProvider, useHealth } from "../../lib/health";
import {
  RATE_LIMIT_DISMISS_MS,
  RATE_LIMIT_MAX_LIFETIME_MS,
  onRateLimit,
} from "../../lib/rateLimit";
import { ToastProvider } from "../ui/Toast";
import { SiteBanner } from "./SiteBanner";
import { LanguageSwitcher } from "./LanguageSwitcher";

// Mobile: bottom tab bar stuck to the bottom edge.
// Desktop (md+): 200px left sidebar with paper-alt bg; active nav
// inverts to paper + cobalt. lucide icons pick up the text color for
// their stroke via currentColor, so setting text-cobalt on the
// NavLink makes both label and icon cobalt in the active state.
//
// Step 7 surfaces mounted here:
//   - UPSTREAM_DOWN red banner, driven by HealthProvider's probe.
//   - RATE_LIMITED amber banner, driven by the rateLimit EventTarget.
//     Auto-dismisses 30s after the most recent 429; capped at 5 min
//     total lifetime before force-dismiss.
//
// Language switcher lives in the sidebar footer on desktop and in a
// mobile header gear-slot (top-right of the viewport) on narrow widths.
// Bottom tabs stay pure navigation — preferences live elsewhere.

type NavItem = {
  to: string;
  icon: typeof ScanLine;
  labelKey: string;
};

const NAV: NavItem[] = [
  { to: "/", icon: ScanLine, labelKey: "nav.scan" },
  { to: "/history", icon: Clock, labelKey: "nav.history" },
  { to: "/account", icon: User, labelKey: "nav.account" },
];

export function AppShell({ children }: { children: ReactNode }) {
  useEffect(() => {
    void postSession().catch(() => {});
  }, []);

  return (
    <HealthProvider>
      <ToastProvider>
        <div className="min-h-full flex flex-col md:flex-row bg-paper text-ink">
          <Sidebar />
          <div className="flex-1 flex flex-col min-w-0">
            <SystemBanners />
            <MobileHeader />
            <main className="flex-1 pb-[72px] md:pb-0">{children}</main>
          </div>
          <BottomTabs />
        </div>
      </ToastProvider>
    </HealthProvider>
  );
}

function SystemBanners() {
  // Subscribing to useTranslation here (even without using `t`) makes
  // the banner re-render on language changes — the ERROR_UX proxy
  // reads localized copy at access time, but needs a render to surface.
  useTranslation();
  const { healthy } = useHealth();
  const [rateLimited, setRateLimited] = useState(false);
  const sessionStartRef = useRef<number | null>(null);
  const dismissTimerRef = useRef<number | null>(null);
  const capTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const clearDismiss = () => {
      if (dismissTimerRef.current !== null) {
        window.clearTimeout(dismissTimerRef.current);
        dismissTimerRef.current = null;
      }
    };
    const clearCap = () => {
      if (capTimerRef.current !== null) {
        window.clearTimeout(capTimerRef.current);
        capTimerRef.current = null;
      }
    };

    const handle = () => {
      const now = Date.now();
      if (
        sessionStartRef.current === null ||
        now - sessionStartRef.current >= RATE_LIMIT_MAX_LIFETIME_MS
      ) {
        sessionStartRef.current = now;
        clearCap();
        capTimerRef.current = window.setTimeout(() => {
          sessionStartRef.current = null;
          setRateLimited(false);
          clearDismiss();
        }, RATE_LIMIT_MAX_LIFETIME_MS);
      }

      setRateLimited(true);

      clearDismiss();
      dismissTimerRef.current = window.setTimeout(() => {
        sessionStartRef.current = null;
        setRateLimited(false);
        clearCap();
      }, RATE_LIMIT_DISMISS_MS);
    };

    const unsubscribe = onRateLimit(handle);
    return () => {
      unsubscribe();
      clearDismiss();
      clearCap();
    };
  }, []);

  return (
    <>
      {!healthy && (
        <SiteBanner variant="red">{ERROR_UX.UPSTREAM_DOWN.body}</SiteBanner>
      )}
      {rateLimited && (
        <SiteBanner
          variant="amber"
          onDismiss={() => {
            sessionStartRef.current = null;
            setRateLimited(false);
          }}
        >
          {ERROR_UX.RATE_LIMITED.body}
        </SiteBanner>
      )}
    </>
  );
}

function BrandBlock() {
  // Brand stays bilingual regardless of active locale — "真伪 · Verify"
  // is part of the visual identity, not a translation target. Only the
  // aria-label follows the active language so screen readers get a
  // native-language "home" hint.
  const { t } = useTranslation();
  return (
    <Link
      to="/"
      aria-label={t("brand.ariaLabel")}
      className="flex items-center gap-[9px] rounded-btn -mx-1 px-1 py-0.5 transition-colors hover:bg-paper no-underline"
    >
      <div
        aria-hidden
        className="flex h-6 w-6 items-center justify-center rounded-[7px] bg-cobalt text-[12px] font-medium text-paper"
      >
        眼
      </div>
      <div className="text-[15px] font-medium leading-none text-ink">
        真伪 <span className="opacity-70">·</span> Verify
      </div>
    </Link>
  );
}

function MobileHeader() {
  // Mobile-only header strip. Exists solely to house the language
  // switcher — there is no other preference today, and leaving this
  // slot in place means future settings (theme, about) have a natural
  // home. Desktop keeps the sidebar, so this whole bar is md:hidden.
  return (
    <div className="flex items-center justify-end px-3 py-1.5 md:hidden">
      <LanguageSwitcher variant="icon" />
    </div>
  );
}

function Sidebar() {
  const { t } = useTranslation();
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
                <span>{t(item.labelKey)}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>
      {/* Footer slot: language switcher sits visually detached from the
          primary nav via mt-auto so it anchors to the bottom edge. */}
      <div className="mt-auto pt-4">
        <LanguageSwitcher variant="sidebar" />
      </div>
    </aside>
  );
}

function BottomTabs() {
  const { t } = useTranslation();
  return (
    <nav
      aria-label={t("nav.primaryLabel")}
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
              <span className="text-[10px]">{t(item.labelKey)}</span>
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
