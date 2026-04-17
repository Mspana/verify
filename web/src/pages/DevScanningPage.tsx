// Dev-only route that renders the scanning-state view in isolation —
// no polling, no scanId. Useful for reviewing the scanning layout
// without having to kick off a real upload. The production /scan/:id
// route stays unchanged.

import { Check, ChevronLeft, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";

export function DevScanningPage() {
  const navigate = useNavigate();
  return (
    <div className="flex flex-col md:mx-auto md:max-w-[640px] md:px-10 md:py-10">
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

      <div className="hidden md:block">
        <p className="mb-1.5 text-[11px] uppercase tracking-[0.3px] text-ink/55">
          Scanning
        </p>
        <h1 className="mb-6 text-[26px] font-medium leading-[1.2]">
          Analyzing image
          <span aria-hidden>
            <span className="scan-dot-1">.</span>
            <span className="scan-dot-2">.</span>
            <span className="scan-dot-3">.</span>
          </span>
        </h1>
      </div>

      <div className="px-5 pb-6 md:px-0">
        <div className="relative aspect-square overflow-hidden rounded-[14px] bg-gradient-to-br from-[#E8DFD0] to-[#D9C8A8] md:aspect-[4/3]">
          <div className="absolute inset-0 overflow-hidden">
            <div
              className="scan-sweep absolute inset-x-0 h-[40%] border-b-[1.5px] border-cobalt"
              style={{
                background:
                  "linear-gradient(180deg, transparent 0%, rgba(22, 82, 240, 0.25) 50%, transparent 100%)",
              }}
            />
          </div>
          {["left-3 top-3", "right-3 top-3", "bottom-3 left-3", "bottom-3 right-3"].map(
            (pos, i) => {
              const d = ["M2 8V2h6", "M18 8V2h-6", "M2 12v6h6", "M18 12v6h-6"][i]!;
              return (
                <svg
                  key={pos}
                  aria-hidden
                  viewBox="0 0 20 20"
                  className={`absolute h-[22px] w-[22px] ${pos}`}
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
            },
          )}
        </div>

        <div className="mt-5 text-center md:hidden">
          <h2 className="text-[17px] font-medium leading-tight">
            Analyzing image
            <span aria-hidden>
              <span className="scan-dot-1">.</span>
              <span className="scan-dot-2">.</span>
              <span className="scan-dot-3">.</span>
            </span>
          </h2>
          <p className="mt-1 text-[13px] text-ink/55">正在分析图片</p>
        </div>

        <div className="mt-5 flex flex-col gap-[11px] rounded-[11px] border border-border bg-white px-4 py-3.5">
          <Step state="done" label="Uploaded" />
          <Step state="done" label="Preprocessing" />
          <Step state="active" label="Detecting AI patterns" />
          <Step state="pending" label="Generating heatmap" />
        </div>
      </div>
    </div>
  );
}

function Step({
  state,
  label,
}: {
  state: "done" | "active" | "pending";
  label: string;
}) {
  return (
    <div
      className={[
        "flex items-center gap-[11px] text-[13px]",
        state === "pending" ? "opacity-[0.42]" : "",
      ].join(" ")}
    >
      <span className="flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center">
        {state === "done" ? (
          <Check className="h-3.5 w-3.5 text-ai-accent" strokeWidth={2} />
        ) : state === "active" ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-cobalt" strokeWidth={1.5} />
        ) : (
          <span
            aria-hidden
            className="h-3.5 w-3.5 rounded-full border-[1.5px] border-border"
          />
        )}
      </span>
      <span className={state === "active" ? "font-medium" : ""}>{label}</span>
    </div>
  );
}
