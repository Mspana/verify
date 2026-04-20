import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { Scan } from "@verify/shared";

import { ApiError, deleteScan, getScans, postRestore } from "../lib/api";
import { resolveErrorCopy } from "../lib/errors";
import { Banner } from "../components/ui/Banner";
import { EmptyState } from "../components/history/EmptyState";
import { ScanRow } from "../components/history/ScanRow";
import { useToast } from "../components/ui/Toast";

// /history is the full list with a segmented Active / Trash toggle and
// row-level delete (active) / restore (trash). Toggle state lives in
// the URL (?view=trash) so back/forward and refresh preserve the view.
//
// Delete is optimistic: the row vanishes immediately, a toast offers
// Undo for 5s. If the user clicks Undo we POST /restore and put the
// row back in its original position. If the DELETE call itself fails,
// we revert and surface a non-Undo "couldn't delete" toast.
//
// Restore (from trash) is also optimistic but doesn't get an Undo —
// per spec, restoring is non-destructive and double-restore is a
// no-op, so the affordance would just add noise.

type View = "active" | "trash";

function readView(params: URLSearchParams): View {
  return params.get("view") === "trash" ? "trash" : "active";
}

export function HistoryPage() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const view = readView(params);

  const [scans, setScans] = useState<Scan[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const toast = useToast();

  useEffect(() => {
    let cancelled = false;
    setScans(null);
    setLoadError(null);
    getScans({ deleted: view === "trash" })
      .then((res) => {
        if (cancelled) return;
        setScans(res.scans);
      })
      .catch((e) => {
        if (cancelled) return;
        const msg =
          e instanceof ApiError
            ? resolveErrorCopy(e.code, e.message).body
            : t("history.couldntLoad");
        setLoadError(msg);
      });
    return () => {
      cancelled = true;
    };
  }, [view, t]);

  const setView = (next: View) => {
    const updated = new URLSearchParams(params);
    if (next === "trash") updated.set("view", "trash");
    else updated.delete("view");
    setParams(updated, { replace: true });
  };

  const handleDelete = async (scan: Scan) => {
    if (!scans) return;
    const indexBeforeRemoval = scans.findIndex((s) => s.id === scan.id);
    if (indexBeforeRemoval < 0) return;
    const optimistic = scans.filter((s) => s.id !== scan.id);
    setScans(optimistic);

    try {
      await deleteScan(scan.id);
      toast.show({
        message: t("history.toast.deleted"),
        action: {
          label: t("common.undo"),
          onClick: () => void undoDelete(scan, indexBeforeRemoval),
        },
      });
    } catch {
      setScans((current) => {
        if (!current) return current;
        const restored = [...current];
        restored.splice(indexBeforeRemoval, 0, scan);
        return restored;
      });
      toast.show({ message: t("history.toast.deleteFailed") });
    }
  };

  const undoDelete = async (scan: Scan, originalIndex: number) => {
    try {
      await postRestore(scan.id);
      setScans((current) => {
        if (!current) return current;
        if (current.some((s) => s.id === scan.id)) return current;
        const restored = [...current];
        const insertAt = Math.min(originalIndex, restored.length);
        restored.splice(insertAt, 0, scan);
        return restored;
      });
    } catch {
      toast.show({ message: t("history.toast.undoFailed") });
    }
  };

  const handleRestore = async (scan: Scan) => {
    if (!scans) return;
    const optimistic = scans.filter((s) => s.id !== scan.id);
    setScans(optimistic);
    try {
      await postRestore(scan.id);
      toast.show({ message: t("history.toast.restored") });
    } catch {
      setScans((current) => (current ? [scan, ...current] : current));
      toast.show({ message: t("history.toast.restoreFailed") });
    }
  };

  return (
    <div className="mx-auto max-w-[840px] px-5 pt-2 pb-3.5 md:px-10 md:py-8">
      <header className="mb-[14px] md:mb-[18px]">
        <p className="mb-1.5 text-[11px] uppercase tracking-[0.3px] text-ink/55">
          {t("history.eyebrow")}
        </p>
        <h1 className="text-[20px] font-medium leading-[1.2] md:text-[24px]">
          {t("history.title")}
        </h1>
      </header>

      <ViewToggle view={view} onChange={setView} />

      <section
        aria-labelledby="scans-heading"
        aria-live="polite"
        className="mt-5"
      >
        <h2 id="scans-heading" className="sr-only">
          {view === "active" ? t("history.activeScans") : t("history.trashedScans")}
        </h2>
        {loadError && <Banner kind="info">{loadError}</Banner>}
        {!loadError && scans === null && (
          <div className="text-sm text-ink/55">{t("common.loading")}</div>
        )}
        {!loadError && scans?.length === 0 && (
          <EmptyState
            title={view === "active" ? t("history.noScansTitle") : t("history.trashEmptyTitle")}
            body={
              view === "active"
                ? t("history.previousHere")
                : t("history.trashExplainer")
            }
          />
        )}
        {!loadError && scans && scans.length > 0 && (
          <ul className="flex flex-col gap-2 md:gap-2.5">
            {scans.map((s) => (
              <li key={s.id}>
                <ScanRow
                  scan={s}
                  variant={view === "trash" ? "trash" : "default"}
                  onDelete={view === "active" ? () => handleDelete(s) : undefined}
                  onRestore={view === "trash" ? () => handleRestore(s) : undefined}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function ViewToggle({
  view,
  onChange,
}: {
  view: View;
  onChange: (next: View) => void;
}) {
  const { t } = useTranslation();
  const itemBase =
    "flex-1 rounded-btn px-3 py-1.5 text-[12px] transition-colors";
  return (
    <div
      role="tablist"
      aria-label={t("history.viewLabel")}
      className="flex gap-1 rounded-btn bg-paper-alt p-1 md:max-w-[260px]"
    >
      <button
        role="tab"
        aria-selected={view === "active"}
        onClick={() => onChange("active")}
        className={[
          itemBase,
          view === "active"
            ? "bg-paper text-ink font-medium shadow-sm"
            : "text-ink/55 hover:text-ink",
        ].join(" ")}
      >
        {t("history.active")}
      </button>
      <button
        role="tab"
        aria-selected={view === "trash"}
        onClick={() => onChange("trash")}
        className={[
          itemBase,
          view === "trash"
            ? "bg-paper text-ink font-medium shadow-sm"
            : "text-ink/55 hover:text-ink",
        ].join(" ")}
      >
        {t("history.trash")}
      </button>
    </div>
  );
}
