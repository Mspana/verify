import { ChevronRight, RotateCcw, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";
import type { MouseEvent } from "react";
import { useTranslation } from "react-i18next";
import type { Scan, VerdictLabel } from "@verify/shared";

import { formatPercent, formatRelative } from "../../lib/format";
import { VerdictStatus } from "../verdict/VerdictStatus";

// Stacked-list row matching 01-home.html scan-row-m / scan-row-d.
//
// Variants:
//   default — active scan; renders timestamp + optional delete button.
//   trash   — soft-deleted scan; suppresses the timestamp and swaps
//             delete for restore.

type Props = {
  scan: Scan;
  variant?: "default" | "trash";
  onDelete?: () => void;
  onRestore?: () => void;
};

const THUMB_FILL: Record<VerdictLabel, string> = {
  human: "bg-human-fill text-human-ink",
  ai: "bg-ai-fill text-ai-ink",
  uncertain: "bg-uncertain-fill text-uncertain-ink",
};

export function ScanRow({
  scan,
  variant = "default",
  onDelete,
  onRestore,
}: Props) {
  const { t } = useTranslation();
  const showTimestamp = variant === "default";

  return (
    <Link
      to={`/scan/${encodeURIComponent(scan.id)}`}
      className="group flex items-center gap-3 rounded-card border border-border bg-white p-2.5 transition-colors hover:bg-paper-alt md:gap-4 md:p-4"
    >
      <Thumbnail scan={scan} />

      <div className="min-w-0 flex-1">
        <div className="hidden md:block">
          <div className="truncate text-[13px] font-medium leading-tight">
            {scan.filename}
          </div>
          <div className="mt-1 flex items-center gap-2">
            <VerdictStatus verdict={scan.verdict} />
            {scan.verdict.status === "ready" && (
              <>
                <span className="text-[11px] text-ink/40">·</span>
                <span className="text-[11px] text-ink/55">
                  {t("verdict.confidence", {
                    value: formatPercent(scan.verdict.confidence, 0),
                  })}
                </span>
              </>
            )}
          </div>
        </div>
        <div className="md:hidden">
          <VerdictStatus verdict={scan.verdict} />
          <p className="mt-0.5 truncate text-[11px] text-ink/55">
            {showTimestamp
              ? `${scan.filename} · ${formatRelative(scan.createdAt)}`
              : scan.filename}
          </p>
        </div>
      </div>

      {showTimestamp && (
        <p className="hidden flex-shrink-0 text-[11px] text-ink/55 md:block">
          {formatRelative(scan.createdAt)}
        </p>
      )}

      {variant === "default" && onDelete && (
        <RowActionButton
          icon={Trash2}
          label={t("history.deleteLabel")}
          onActivate={onDelete}
          variant="danger"
        />
      )}
      {variant === "trash" && onRestore && (
        <RowActionButton
          icon={RotateCcw}
          label={t("history.restoreLabel")}
          onActivate={onRestore}
          variant="neutral"
        />
      )}

      <ChevronRight
        className="h-4 w-4 flex-shrink-0 text-ink/40"
        aria-hidden
      />
    </Link>
  );
}

function RowActionButton({
  icon: Icon,
  label,
  onActivate,
  variant,
}: {
  icon: typeof Trash2;
  label: string;
  onActivate: () => void;
  variant: "danger" | "neutral";
}) {
  const handle = (e: MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    onActivate();
  };
  const visibilityCls =
    "opacity-100 md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100";
  const colorCls =
    variant === "danger"
      ? "text-ink/55 hover:bg-human-fill hover:text-human-ink"
      : "text-ink/55 hover:bg-paper-alt hover:text-ink";
  return (
    <button
      type="button"
      onClick={handle}
      aria-label={label}
      title={label}
      className={[
        "flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-btn transition",
        visibilityCls,
        colorCls,
      ].join(" ")}
    >
      <Icon className="h-4 w-4" strokeWidth={1.5} aria-hidden />
    </button>
  );
}

function Thumbnail({ scan }: { scan: Scan }) {
  const fillCls =
    scan.verdict.status === "ready"
      ? THUMB_FILL[scan.verdict.label]
      : "bg-paper-alt text-ink/55";

  const sizeCls =
    "h-[46px] w-[46px] md:h-[60px] md:w-[60px] flex-shrink-0 rounded-btn";

  if (scan.preview.status === "ready") {
    return (
      <img
        src={scan.preview.url}
        alt=""
        className={`${sizeCls} object-cover bg-paper-alt`}
      />
    );
  }
  return (
    <div
      aria-hidden
      className={`${sizeCls} flex items-center justify-center text-[10px] font-medium ${fillCls}`}
    >
      IMG
    </div>
  );
}
