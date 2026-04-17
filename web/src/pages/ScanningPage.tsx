import { Check, ChevronLeft, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";

import { Banner } from "../components/ui/Banner";
import { Button } from "../components/ui/Button";
import { resolveErrorCopy } from "../lib/errors";
import { useScan } from "../lib/polling";
import { ResultPage } from "./ResultPage";

// /scan/:id route. Owns polling and swaps between ScanningState and
// ResultPage based on the scan's top-level state. See lib/polling.ts
// for the state machine.
//
// The uploaded image rides through as `state.blobUrl` from HomePage's
// navigate() call. We hold it in component state and revoke on unmount.
// On a page refresh the blobUrl is gone (nav state doesn't persist
// through a reload) — we gracefully fall back to the gradient
// placeholder and keep polling; the verdict arrives regardless.

/** Nav-state payload passed from HomePage → ScanningPage. */
export type ScanningNavState = {
  /** Object URL for the File the user just uploaded. ScanningPage
   *  revokes it on unmount. Absent after a page refresh. */
  blobUrl?: string;
};

export function ScanningPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const scanId = id ?? "";
  const { scan, error } = useScan(scanId);

  // Capture the blob URL once on mount so it survives re-renders even
  // if the router clears state later. Revoke on unmount to avoid a
  // leak in long-lived sessions (user scans many images in one tab).
  const navState = (location.state ?? null) as ScanningNavState | null;
  const [blobUrl] = useState<string | undefined>(() => navState?.blobUrl);
  useEffect(() => {
    return () => {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [blobUrl]);

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
    return <ScanningState blobUrl={blobUrl} />;
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

function ScanningState({ blobUrl }: { blobUrl?: string }) {
  const navigate = useNavigate();
  return (
    <div className="flex flex-col md:mx-auto md:max-w-[640px] md:px-10 md:py-10">
      {/* Mobile back-row. Desktop uses sidebar nav, no back row. */}
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
        <ScanImage blobUrl={blobUrl} />

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

function ScanImage({ blobUrl }: { blobUrl?: string }) {
  // Image drives the container's size. `w-fit` makes the positioned
  // parent shrink to the image's intrinsic dimensions so the sweep
  // and corner brackets overlay exactly on top. max-h on mobile keeps
  // a tall portrait from pushing the rest of the UI below the fold.
  // No blob URL (e.g. after a refresh): fall back to the gradient
  // placeholder with a sensible aspect so the sweep still renders.
  if (!blobUrl) {
    return (
      <div className="relative mx-auto w-full overflow-hidden rounded-[14px] aspect-square bg-gradient-to-br from-[#E8DFD0] to-[#D9C8A8] md:aspect-[4/3] md:max-w-[540px]">
        <Sweep />
        <Corners />
      </div>
    );
  }
  return (
    <div className="relative mx-auto w-fit">
      <img
        src={blobUrl}
        alt=""
        className="block h-auto w-auto max-w-full rounded-[14px] max-h-[70vh] md:max-w-[540px] md:max-h-none"
      />
      <Sweep />
      <Corners />
    </div>
  );
}

function Sweep() {
  return (
    <div className="absolute inset-0 overflow-hidden rounded-[14px] pointer-events-none">
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
  const items: [string, string][] = [
    ["left-3 top-3", "M2 8V2h6"],
    ["right-3 top-3", "M18 8V2h-6"],
    ["bottom-3 left-3", "M2 12v6h6"],
    ["bottom-3 right-3", "M18 12v6h-6"],
  ];
  return (
    <>
      {items.map(([pos, d]) => (
        <svg
          key={pos}
          aria-hidden
          viewBox="0 0 20 20"
          className={`absolute h-[22px] w-[22px] pointer-events-none ${pos}`}
        >
          <path
            d={d}
            stroke="#1652F0"
            strokeWidth={2}
            fill="none"
            strokeLinecap="round"
          />
        </svg>
      ))}
    </>
  );
}

// Progressive steps list. Backend doesn't expose staged progress —
// these are aspirational during polling.
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
            s.state === "pending" ? "opacity-[0.42]" : "text-ink",
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
        <Loader2
          className="h-3.5 w-3.5 animate-spin text-cobalt"
          strokeWidth={1.5}
        />
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
