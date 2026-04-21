import { ChevronDown, Download, FileText, Image, Loader2 } from "lucide-react";
import { useEffect, useRef, useState, type RefObject } from "react";
import { useTranslation } from "react-i18next";

import { useToast } from "../ui/Toast";
import { exportResult, type ExportFormat } from "../../lib/exportResult";

type Props = {
  scanId: string;
  targetRef: RefObject<HTMLDivElement>;
  disabled?: boolean;
  disabledHint?: string;
};

export function ExportButton({
  scanId,
  targetRef,
  disabled = false,
  disabledHint,
}: Props) {
  const { t } = useTranslation();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const handleExport = async (format: ExportFormat) => {
    setOpen(false);
    const target = targetRef.current;
    if (!target || busy) return;
    setBusy(true);
    try {
      await exportResult(target, scanId, format);
    } catch (err) {
      if (import.meta.env.DEV) {
        console.error("[export] failed", err);
      }
      toast.show({ message: t("export.failed") });
    } finally {
      setBusy(false);
    }
  };

  const triggerDisabled = disabled || busy;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={triggerDisabled}
        aria-haspopup="menu"
        aria-expanded={open}
        title={disabled ? disabledHint : undefined}
        className="flex items-center gap-[8px] rounded-btn border border-border bg-white px-3 py-[9px] text-[13px] text-ink transition-colors hover:bg-paper-alt disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-white"
      >
        {busy ? (
          <>
            <Loader2
              className="h-[15px] w-[15px] animate-spin"
              strokeWidth={1.5}
              aria-hidden
            />
            <span>{t("export.exporting")}</span>
          </>
        ) : (
          <>
            <Download
              className="h-[15px] w-[15px]"
              strokeWidth={1.5}
              aria-hidden
            />
            <span>{t("export.label")}</span>
            <ChevronDown
              className="h-[14px] w-[14px] opacity-70"
              strokeWidth={1.5}
              aria-hidden
            />
          </>
        )}
      </button>

      {open && !triggerDisabled && (
        <div
          role="menu"
          aria-label={t("export.menuLabel")}
          className="absolute right-0 top-[calc(100%+6px)] z-30 flex min-w-[180px] flex-col rounded-[10px] border border-border bg-white py-1 shadow-lg"
        >
          <MenuItem
            icon={<FileText className="h-[15px] w-[15px]" strokeWidth={1.5} aria-hidden />}
            label={t("export.pdf")}
            onClick={() => void handleExport("pdf")}
          />
          <MenuItem
            icon={<Image className="h-[15px] w-[15px]" strokeWidth={1.5} aria-hidden />}
            label={t("export.png")}
            onClick={() => void handleExport("png")}
          />
        </div>
      )}
    </div>
  );
}

function MenuItem({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="flex items-center gap-[10px] px-3 py-[9px] text-left text-[13px] text-ink transition-colors hover:bg-paper-alt"
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
