import { X } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "../ui/Button";

// Full-page error shell used by every `surface === "full-page"` or
// `quota-screen` error. Matches the "SCAN FAILED (FULL PAGE)" pattern
// in 06-empty-and-errors.html: icon circle at top, title, body,
// action row, monospace error-code footer.
//
// Two variants, deliberately binary:
//   red   — something failed (SCAN_FAILED, UPLOAD_FAILED, INTERNAL_ERROR, …)
//   amber — a soft limit, not a failure (QUOTA_EXCEEDED)
//
// Rendered inside AppShell's main content area so the sidebar / nav
// stay usable — we don't take over the viewport. Every page that
// shows an ErrorPage is expected to provide at least a primary or
// secondary action; users should never be stranded without a next step.

type Variant = "red" | "amber";

type Action = {
  label: string;
  onClick: () => void;
};

type Props = {
  variant: Variant;
  title: string;
  body: ReactNode;
  primary?: Action;
  secondary?: Action;
  /** Machine-readable code shown in the monospace footer ("SCAN_FAILED").
   *  Optional — if omitted, the footer is hidden entirely. */
  code?: string;
  /** Optional extra content (subtext, countdown) between body and actions. */
  extra?: ReactNode;
};

const ICON_CIRCLE: Record<Variant, string> = {
  red: "bg-human-fill text-human-ink",
  amber: "bg-uncertain-fill text-uncertain-ink",
};

export function ErrorPage({
  variant,
  title,
  body,
  primary,
  secondary,
  code,
  extra,
}: Props) {
  return (
    <div className="mx-auto max-w-[480px] px-5 py-12 md:py-16">
      <div className="rounded-card border border-border bg-white p-6 md:p-8">
        <div className="text-center">
          <div
            aria-hidden
            className={[
              "mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full",
              ICON_CIRCLE[variant],
            ].join(" ")}
          >
            <X
              className={[
                "h-[17px] w-[17px]",
                variant === "red" ? "text-human-accent" : "text-uncertain-accent",
              ].join(" ")}
              strokeWidth={2}
              aria-hidden
            />
          </div>
          <h1 className="mb-1.5 text-[15px] font-medium leading-tight">
            {title}
          </h1>
          <div className="text-[12px] text-ink/65">{body}</div>
          {extra && <div className="mt-3">{extra}</div>}
          {(primary || secondary) && (
            <div className="mt-4 flex justify-center gap-2.5">
              {primary && (
                <Button
                  variant="primary"
                  onClick={primary.onClick}
                  className="px-[18px] py-[9px] text-[12px]"
                >
                  {primary.label}
                </Button>
              )}
              {secondary && (
                <Button
                  variant="secondary"
                  onClick={secondary.onClick}
                  className="px-[18px] py-[9px] text-[12px]"
                >
                  {secondary.label}
                </Button>
              )}
            </div>
          )}
        </div>
        {code && (
          <div className="mt-5 border-t border-border pt-3 text-center">
            <p className="text-[11px] text-ink/55">
              Error code:{" "}
              <code className="font-mono text-ink/75">{code}</code>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
