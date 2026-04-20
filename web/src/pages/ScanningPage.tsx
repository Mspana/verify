import { Check, ChevronLeft, Loader2 } from "lucide-react";
import { useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { Preview } from "@verify/shared";

import { ErrorPage } from "../components/error/ErrorPage";
import { ACTION_LABEL, resolveErrorCopy } from "../lib/errors";
import { useScan } from "../lib/polling";
import { ResultPage } from "./ResultPage";

// /scan/:id route. Owns polling and swaps between:
//   - polling  → ScanningState (image frame + sweep + "Analyzing"
//                copy + progressive steps list)
//   - partial  → ResultPage (with skeletons for still-loading bits)
//   - complete → ResultPage (fully populated)
//   - error    → inline error panel (step 7 promotes full-page errors
//                to the dedicated ErrorPage per ERRORS.md)

/** Nav-state payload passed from HomePage → ScanningPage. */
export type ScanningNavState = {
  blobUrl?: string;
};

export function ScanningPage() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const scanId = id ?? "";
  const { scan, error } = useScan(scanId);

  const navState = (location.state ?? null) as ScanningNavState | null;
  const [uploadedBlobUrl] = useState<string | undefined>(() => navState?.blobUrl);

  if (error) {
    return <ScanErrorPage code={error.code} serverMessage={error.message} />;
  }

  if (!scan || scan.state === "polling") {
    return <ScanningState preview={scan?.preview} blobUrl={uploadedBlobUrl} />;
  }

  if (scan.state === "error") {
    const code = scan.error?.code ?? "SCAN_FAILED";
    return <ScanErrorPage code={code} serverMessage={scan.error?.message} />;
  }

  return <ResultPage scan={scan} />;
}

function ScanErrorPage({
  code,
  serverMessage,
}: {
  code: import("@verify/shared").ErrorCode;
  serverMessage?: string;
}) {
  const navigate = useNavigate();
  const copy = resolveErrorCopy(code, serverMessage);
  const resolveAction = (token: typeof copy.primary) => {
    switch (token) {
      case "retry":
      case "go-back":
      case "go-home":
      case "scan-another":
        return { label: ACTION_LABEL[token], onClick: () => navigate("/") };
      case "refresh":
        return {
          label: ACTION_LABEL.refresh,
          onClick: () => window.location.reload(),
        };
      case "see-history":
        return {
          label: ACTION_LABEL["see-history"],
          onClick: () => navigate("/history"),
        };
      default:
        return undefined;
    }
  };
  return (
    <ErrorPage
      variant="red"
      title={copy.headline}
      body={copy.body}
      code={code}
      primary={resolveAction(copy.primary)}
      secondary={resolveAction(copy.secondary)}
    />
  );
}

function AnimatedDots() {
  return (
    <span aria-hidden>
      <span className="scan-dot-1">.</span>
      <span className="scan-dot-2">.</span>
      <span className="scan-dot-3">.</span>
    </span>
  );
}

function ScanningState({
  preview,
  blobUrl,
}: {
  preview?: Preview;
  blobUrl?: string;
}) {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? i18n.language;
  const isZh = lang === "zh-CN";
  return (
    <div className="flex flex-col md:mx-auto md:max-w-[640px] md:px-10 md:py-10">
      <div className="flex items-center gap-2.5 px-5 py-3.5 md:hidden">
        <button
          type="button"
          onClick={() => navigate("/")}
          className="flex h-[26px] w-[26px] items-center justify-center rounded-[7px] bg-paper-alt text-ink"
          aria-label={t("common.back")}
        >
          <ChevronLeft className="h-4 w-4" strokeWidth={1.5} />
        </button>
        <h2 className="text-[15px] font-medium">{t("scanning.eyebrow")}</h2>
      </div>

      <div className="hidden md:block">
        <p className="mb-1.5 text-[11px] uppercase tracking-[0.3px] text-ink/55">
          {t("scanning.eyebrow")}
        </p>
        <h1 className="mb-6 text-[26px] font-medium leading-[1.2]">
          {t("scanning.title")}
          <AnimatedDots />
        </h1>
      </div>

      <div className="px-5 pb-6 md:px-0">
        <ScanImage preview={preview} blobUrl={blobUrl} />

        <div className="mt-5 text-center md:hidden">
          <h2 className="text-[17px] font-medium leading-tight">
            {t("scanning.title")}
            <AnimatedDots />
          </h2>
          {/* Bilingual echo on mobile only when English is active — when
              Chinese is active, the main title is already in Chinese and
              the echo would just duplicate it. */}
          {!isZh && (
            <p className="mt-1 text-[13px] text-ink/55">
              {t("scanning.chineseSubtitle")}
            </p>
          )}
        </div>

        <StepsList />
      </div>
    </div>
  );
}

function ScanImage({
  preview,
  blobUrl,
}: {
  preview?: Preview;
  blobUrl?: string;
}) {
  const src =
    blobUrl ?? (preview?.status === "ready" ? preview.url : undefined);

  if (!src) {
    return (
      <div className="relative mx-auto w-full overflow-hidden rounded-[14px] aspect-square bg-gradient-to-br from-[#E8DFD0] to-[#D9C8A8] md:aspect-[4/3] md:max-w-[540px]">
        <SweepOverlay />
        <Corners />
      </div>
    );
  }

  return (
    <div className="relative mx-auto w-fit max-w-full">
      <img
        src={src}
        alt=""
        className="block max-w-full max-h-[70vh] rounded-[14px] md:max-w-[540px] md:max-h-none"
      />
      <SweepOverlay />
      <Corners />
    </div>
  );
}

function SweepOverlay() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[14px]">
      <div
        className="scan-sweep absolute inset-x-0 h-[40%] border-b-[1.5px] border-cobalt"
        style={{
          background:
            "linear-gradient(180deg, transparent 0%, rgba(22, 82, 240, 0.25) 50%, transparent 100%)",
        }}
      />
    </div>
  );
}

function Corners() {
  return (
    <>
      <CornerBracket className="left-3 top-3" d="M2 8V2h6" />
      <CornerBracket className="right-3 top-3" d="M18 8V2h-6" />
      <CornerBracket className="bottom-3 left-3" d="M2 12v6h6" />
      <CornerBracket className="bottom-3 right-3" d="M18 12v6h-6" />
    </>
  );
}

function CornerBracket({ className, d }: { className: string; d: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 20 20"
      className={`absolute h-[22px] w-[22px] ${className}`}
    >
      <path
        d={d}
        stroke="#1652F0"
        strokeWidth={2}
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  );
}

type StepState = "done" | "active" | "pending";
type Step = { labelKey: string; state: StepState };

const STEPS: Step[] = [
  { labelKey: "scanning.steps.uploaded", state: "done" },
  { labelKey: "scanning.steps.preprocessing", state: "done" },
  { labelKey: "scanning.steps.detecting", state: "active" },
  { labelKey: "scanning.steps.heatmap", state: "pending" },
];

function StepsList() {
  const { t } = useTranslation();
  return (
    <div className="mt-5 flex flex-col gap-[11px] rounded-[11px] border border-border bg-white px-4 py-3.5">
      {STEPS.map((s) => (
        <div
          key={s.labelKey}
          className={[
            "flex items-center gap-[11px] text-[13px]",
            s.state === "pending"
              ? "opacity-[0.42]"
              : s.state === "done"
                ? "text-ink"
                : "text-ink",
          ].join(" ")}
        >
          <StepMarker state={s.state} />
          <span className={s.state === "active" ? "font-medium" : ""}>
            {t(s.labelKey)}
          </span>
        </div>
      ))}
    </div>
  );
}

function StepMarker({ state }: { state: StepState }) {
  if (state === "done") {
    return (
      <span className="flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center">
        <Check className="h-3.5 w-3.5 text-ai-accent" strokeWidth={2} />
      </span>
    );
  }
  if (state === "active") {
    return (
      <span className="flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center">
        <Loader2 className="h-3.5 w-3.5 animate-spin text-cobalt" strokeWidth={1.5} />
      </span>
    );
  }
  return (
    <span
      aria-hidden
      className="h-3.5 w-3.5 flex-shrink-0 rounded-full border-[1.5px] border-border"
    />
  );
}
