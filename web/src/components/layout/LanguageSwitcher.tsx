import { Check, Globe } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { persistLanguage, type Language } from "../../i18n";

// Two presentations share one switch-language action:
//   variant="sidebar"  — desktop sidebar footer. Full-width row styled
//     like the account/brand block: globe icon + current-language name,
//     opens a small popover above the row with both options.
//   variant="icon"     — mobile header gear-equivalent. Icon-only button
//     labelled with an sr-only string; popover anchors bottom-right.
// Menu positioning is done with absolute + transform — small menu, no
// portal needed. Click-outside closes.

const LANGUAGES: Array<{ code: Language; labelKey: string }> = [
  { code: "en", labelKey: "language.english" },
  { code: "zh-CN", labelKey: "language.chinese" },
];

type Props = {
  variant: "sidebar" | "icon";
};

export function LanguageSwitcher({ variant }: Props) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const currentCode = (i18n.resolvedLanguage ?? i18n.language) as Language;
  const current =
    LANGUAGES.find((l) => l.code === currentCode) ?? LANGUAGES[0]!;

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", onClick);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onClick);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const choose = (code: Language) => {
    void i18n.changeLanguage(code);
    persistLanguage(code);
    setOpen(false);
  };

  return (
    <div ref={rootRef} className="relative">
      {variant === "sidebar" ? (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label={t("language.label")}
          className="flex w-full items-center gap-[10px] rounded-btn px-3 py-[9px] text-[12px] text-ink/60 transition-colors hover:bg-paper hover:text-ink"
        >
          <Globe className="h-4 w-4 flex-shrink-0 opacity-70" strokeWidth={1.5} aria-hidden />
          <span className="flex-1 text-left">{t(current.labelKey)}</span>
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label={t("language.label")}
          className="flex h-9 w-9 items-center justify-center rounded-btn text-ink/65 transition-colors hover:bg-paper-alt hover:text-ink"
        >
          <Globe className="h-[18px] w-[18px]" strokeWidth={1.5} aria-hidden />
        </button>
      )}

      {open && (
        <div
          role="menu"
          aria-label={t("language.label")}
          className={
            variant === "sidebar"
              ? "absolute bottom-full left-0 mb-1 w-full min-w-[160px] rounded-btn border border-border bg-paper shadow-md"
              : "absolute right-0 top-full mt-1 w-[160px] rounded-btn border border-border bg-paper shadow-md z-30"
          }
        >
          <ul className="py-1">
            {LANGUAGES.map((l) => {
              const isActive = l.code === currentCode;
              return (
                <li key={l.code}>
                  <button
                    type="button"
                    role="menuitemradio"
                    aria-checked={isActive}
                    onClick={() => choose(l.code)}
                    className={[
                      "flex w-full items-center gap-2 px-3 py-2 text-left text-[12px] transition-colors hover:bg-paper-alt",
                      isActive ? "text-ink font-medium" : "text-ink/75",
                    ].join(" ")}
                  >
                    <span className="flex h-3 w-3 flex-shrink-0 items-center justify-center">
                      {isActive && (
                        <Check className="h-3 w-3 text-cobalt" strokeWidth={2} aria-hidden />
                      )}
                    </span>
                    <span>{t(l.labelKey)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
