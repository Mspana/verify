import { Check, ChevronLeft, Loader2 } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import type { Preview } from "@verify/shared";

import { Banner } from "../components/ui/Banner";
import { Button } from "../components/ui/Button";
import { resolveErrorCopy } from "../lib/errors";
import { useScan } from "../lib/polling";
import { ResultPage } from "./ResultPage";

// /scan/:id route. Owns polling and swaps between:
//   - polling  → ScanningState (image frame + sweep + "Analyzing"
//                copy + progressive steps list)
//   - partial  → ResultPage (with skeletons for still-loading bits)
//   - complete → ResultPage (fully populated)
//   - error    → inline error panel (step 7 promotes full-page errors
//                to the dedicated ErrorPage per ERRORS.md)
//
// SCAN_NOT_FOUND and SCAN_TIMEOUT surface via hook.error and are
// terminal; retry affordance lands in step 7.

export function ScanningPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const scanId = id ?? "";
  const { scan, error } = useScan(scanId);

  if (error) {
    const { headline, body } = resolveErrorCopy(error.code, error.message);
    return (
      <div className="mx-auto max-w-2xl px-5 py-10 md:px-10 md:py-16">
        <Banner kind="error" headline={headline}>
          {body}
        </Banner>
        <div className="mt-4 flex gap-2">
          <Button variant="secondary" onClick={() => navigate("/")}>
            Go back
          </Button>
        </div>
      </div>
    );
  }

  if (!scan || scan.state === "polling") {
    return <ScanningState preview={scan?.preview} />;
  }

  if (scan.state === "error") {
    const code = scan.error?.code ?? "SCAN_FAILED";
    const { headline, body } = resolveErrorCopy(code, scan.error?.message);
    return (
      <div className="mx-auto max-w-2xl px-5 py-10 md:px-10 md:py-16">
        <Banner kind="error" headline={headline}>
          {body}
        </Banner>
        <div className="mt-4 flex gap-2">
          <Button variant="secondary" onClick={() => navigate("/")}>
            Scan another image
          </Button>
        </div>
      </div>
    );
  }

  return <ResultPage scan={scan} />;
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

function ScanningState({ preview }: { preview?: Preview }) {
  const navigate = useNavigate();
  return (
    <div className="flex flex-col md:mx-auto md:max-w-[640px] md:px-10 md:py-10">
      {/* Mobile back-row — desktop uses the sidebar for nav, no back row. */}
      <div className="flex items-center gap-2.5 px-5 py-3.5 md:hidden">
        <button
          type="button"
          onClick={() => navigate("/")}
          className="flex h-[26px] w-[26px] items-center justify-center rounded-[7px] bg-paper-alt text-ink"
          aria-label="Back"
        >
          <ChevronLeft className="h-4 w-4" strokeWidth={1.5} />
        </button>
        <h2 className="text-[15px] font-medium">Scanning</h2>
      </div>

      {/* Desktop eyebrow + title. */}
      <div className="hidden md:block">
        <p className="mb-1.5 text-[11px] uppercase tracking-[0.3px] text-ink/55">
          Scanning
        </p>
        <h1 className="mb-6 text-[26px] font-medium leading-[1.2]">
          Analyzing image
          <AnimatedDots />
        </h1>
      </div>

      <div className="px-5 pb-6 md:px-0">
        <ScanImage preview={preview} />

        {/* Mobile analyzing text — desktop puts it above the image. */}
        <div className="mt-5 text-center md:hidden">
          <h2 className="text-[17px] font-medium leading-tight">
            Analyzing image
            <AnimatedDots />
          </h2>
          <p className="mt-1 text-[13px] text-ink/55">正在分析图片</p>
        </div>

        <StepsList />
      </div>
    </div>
  );
}

function ScanImage({ preview }: { preview?: Preview }) {
  return (
    <div className="relative overflow-hidden rounded-[14px] aspect-square bg-gradient-to-br from-[#E8DFD0] to-[#D9C8A8] md:aspect-[4/3]">
      {preview?.status === "ready" ? (
        <img
          src={preview.url}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : null}

      {/* Cobalt sweep bar, animated top → bottom. */}
      <div className="absolute inset-0 overflow-hidden">
        <div
          className="scan-sweep absolute inset-x-0 h-[40%] border-b-[1.5px] border-cobalt"
          style={{
            background:
              "linear-gradient(180deg, transparent 0%, rgba(22, 82, 240, 0.25) 50%, transparent 100%)",
          }}
        />
      </div>

      {/* Corner brackets. */}
      <CornerBracket className="left-3 top-3" d="M2 8V2h6" />
      <CornerBracket className="right-3 top-3" d="M18 8V2h-6" />
      <CornerBracket className="bottom-3 left-3" d="M2 12v6h6" />
      <CornerBracket className="bottom-3 right-3" d="M18 12v6h-6" />
    </div>
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

// Progressive steps list. Backend doesn't expose staged progress
// today — these are aspirational during polling and all four states
// are derivable from the hook's knowledge: we're here because submit
// succeeded (first two done), verdict is still pending (third active),
// heatmap waits for verdict (fourth pending).
type StepState = "done" | "active" | "pending";
type Step = { label: string; state: StepState };

const STEPS: Step[] = [
  { label: "Uploaded", state: "done" },
  { label: "Preprocessing", state: "done" },
  { label: "Detecting AI patterns", state: "active" },
  { label: "Generating heatmap", state: "pending" },
];

function StepsList() {
  return (
    <div className="mt-5 flex flex-col gap-[11px] rounded-[11px] border border-border bg-white px-4 py-3.5">
      {STEPS.map((s) => (
        <div
          key={s.label}
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
            {s.label}
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
