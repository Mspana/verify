import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { ErrorCode, QuotaResponse, Scan } from "@verify/shared";

import { ApiError, getQuota, getScans } from "../lib/api";
import { ACTION_LABEL, ERROR_UX, resolveErrorCopy } from "../lib/errors";
import { useHealth } from "../lib/health";
import { runUpload } from "../lib/upload";
import { Banner } from "../components/ui/Banner";
import { EmptyState } from "../components/history/EmptyState";
import { ScanRow } from "../components/history/ScanRow";
import { ScanButton } from "../components/scan/ScanButton";
import { UploadArea } from "../components/scan/UploadArea";
import { ErrorPage } from "../components/error/ErrorPage";
import { QuotaExceededPage } from "../components/error/QuotaExceededPage";
import type { ScanningNavState } from "./ScanningPage";

// Home screen matching 01-home.html. Mobile column: eyebrow → title
// → upload-area → full-width CTA → recent scans. Desktop: same column
// but the upload area and CTA sit in a 1fr/180px grid row so the
// cobalt CTA stretches to the full upload area height.
//
// Error handling branches on the error's `surface`:
//   - inline:     render <Banner> above the upload area (validation)
//   - full-page:  replace the page's body with <ErrorPage>
//   - quota-screen: replace with <QuotaExceededPage> (fetches quota)
//   - site-banner: handled globally by AppShell, not here
//
// The upload area + recent scans section is suppressed while a
// full-page error is up — no point showing them under a screen-filling
// failure. The sidebar stays visible because AppShell wraps everything.

type UploadState =
  | { kind: "idle" }
  | { kind: "running" }
  | { kind: "inline-error"; code: ErrorCode; headline: string; message: string }
  | { kind: "full-page-error"; code: ErrorCode }
  | { kind: "quota-exceeded"; quota: QuotaResponse | null };

export function HomePage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const health = useHealth();
  const [file, setFile] = useState<File | null>(null);
  const [upload, setUpload] = useState<UploadState>({ kind: "idle" });
  const [scans, setScans] = useState<Scan[] | null>(null);
  const [scansError, setScansError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getScans({ limit: 20 })
      .then((res) => !cancelled && setScans(res.scans))
      .catch(() => !cancelled && setScansError(t("home.couldntLoad")));
    return () => {
      cancelled = true;
    };
  }, [t]);

  useEffect(() => {
    if (upload.kind !== "quota-exceeded" || upload.quota !== null) return;
    let cancelled = false;
    getQuota()
      .then((q) => {
        if (cancelled) return;
        setUpload({ kind: "quota-exceeded", quota: q });
      })
      .catch(() => {
        if (cancelled) return;
        setUpload({
          kind: "quota-exceeded",
          quota: { used: 0, limit: 0, resetsAt: new Date(Date.now() + 3_600_000).toISOString() },
        });
      });
    return () => {
      cancelled = true;
    };
  }, [upload]);

  const startScan = async () => {
    if (!file) return;
    setUpload({ kind: "running" });
    try {
      const { scanId } = await runUpload(file);
      const blobUrl = URL.createObjectURL(file);
      const navState: ScanningNavState = { blobUrl };
      navigate(`/scan/${encodeURIComponent(scanId)}`, { state: navState });
    } catch (e) {
      if (!(e instanceof ApiError)) {
        setUpload({
          kind: "inline-error",
          code: "INTERNAL_ERROR",
          headline: t("home.genericError.headline"),
          message: t("home.genericError.body"),
        });
        return;
      }
      const ux = ERROR_UX[e.code];
      const copy = resolveErrorCopy(e.code, e.message);
      if (e.code === "QUOTA_EXCEEDED") {
        setUpload({ kind: "quota-exceeded", quota: null });
      } else if (ux.surface === "full-page") {
        setUpload({ kind: "full-page-error", code: e.code });
      } else {
        setUpload({
          kind: "inline-error",
          code: e.code,
          headline: copy.headline,
          message: copy.body,
        });
      }
    }
  };

  const resetAfterError = () => {
    setFile(null);
    setUpload({ kind: "idle" });
  };

  if (upload.kind === "full-page-error") {
    const copy = resolveErrorCopy(upload.code);
    return (
      <ErrorPage
        variant="red"
        title={copy.headline}
        body={copy.body}
        code={upload.code}
        primary={
          copy.primary === "retry"
            ? { label: ACTION_LABEL.retry, onClick: resetAfterError }
            : copy.primary === "refresh"
              ? {
                  label: ACTION_LABEL.refresh,
                  onClick: () => window.location.reload(),
                }
              : copy.primary === "go-home"
                ? { label: ACTION_LABEL["go-home"], onClick: resetAfterError }
                : undefined
        }
        secondary={
          copy.secondary === "go-back"
            ? { label: ACTION_LABEL["go-back"], onClick: resetAfterError }
            : copy.secondary === "go-home"
              ? { label: ACTION_LABEL["go-home"], onClick: resetAfterError }
              : undefined
        }
      />
    );
  }

  if (upload.kind === "quota-exceeded" && upload.quota !== null) {
    return <QuotaExceededPage quota={upload.quota} />;
  }

  return (
    <div className="mx-auto max-w-[840px] px-5 pt-2 pb-3.5 md:px-10 md:py-8">
      <header className="mb-[14px] md:mb-[18px]">
        <p className="mb-1.5 text-[11px] uppercase tracking-[0.3px] text-ink/55">
          {t("home.eyebrow")}
        </p>
        <h1 className="text-[20px] font-medium leading-[1.2] md:text-[24px]">
          {t("home.title")}
        </h1>
      </header>

      {upload.kind === "inline-error" && (
        <div className="mb-3">
          <Banner kind="error" headline={upload.headline}>
            {upload.message}
          </Banner>
          <div className="mt-2.5 flex gap-2.5">
            <button
              type="button"
              onClick={resetAfterError}
              className="rounded-btn bg-cobalt px-4 py-2 text-[12px] font-medium text-paper hover:bg-cobalt/90"
            >
              {t("common.tryAgain")}
            </button>
            <button
              type="button"
              onClick={resetAfterError}
              className="rounded-btn border border-border bg-transparent px-4 py-2 text-[12px] font-medium text-ink hover:bg-paper-alt"
            >
              {t("common.cancel")}
            </button>
          </div>
        </div>
      )}

      <div className="md:grid md:grid-cols-[1fr_180px] md:gap-[14px] md:mb-8">
        <UploadArea
          onFile={(f) => {
            setFile(f);
            setUpload({ kind: "idle" });
          }}
          selectedFile={file}
          disabled={upload.kind === "running"}
        />
        <div className="mt-3 md:mt-0">
          <ScanButton
            onClick={startScan}
            disabled={!file}
            loading={upload.kind === "running"}
            unavailable={!health.healthy}
            unavailableReason={t("upload.detectionOffline")}
          />
        </div>
      </div>

      <section aria-labelledby="history-heading" className="mt-8 md:mt-0">
        <div className="mb-2.5 flex items-baseline justify-between md:mb-3">
          <h2
            id="history-heading"
            className="text-[13px] font-medium md:text-[14px]"
          >
            {t("home.recentScans")}
          </h2>
          {scans && scans.length > 0 && (
            <a
              href="/history"
              className="text-[12px] text-cobalt hover:underline"
            >
              {t("common.seeAll")}
            </a>
          )}
        </div>
        {scansError && <Banner kind="info">{scansError}</Banner>}
        {!scansError && scans === null && (
          <div className="text-sm text-ink/55">{t("common.loading")}</div>
        )}
        {!scansError && scans?.length === 0 && (
          <EmptyState
            title={t("home.noScansTitle")}
            body={t("home.noScansBody")}
          />
        )}
        {!scansError && scans && scans.length > 0 && (
          <ul className="flex flex-col gap-2 md:gap-2.5">
            {scans.slice(0, 5).map((s) => (
              <li key={s.id}>
                <ScanRow scan={s} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
