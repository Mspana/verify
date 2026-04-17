import { AlertTriangle, Loader2 } from "lucide-react";
import type { Scan, VerdictLabel } from "@verify/shared";

import { formatRelative } from "../lib/format";
import { AgreementRow } from "../components/verdict/AgreementRow";
import { KeyIndicators } from "../components/verdict/KeyIndicators";
import { VerdictBanner } from "../components/verdict/VerdictBanner";
import { HeatmapTab } from "../components/result/HeatmapTab";
import { ImageTags } from "../components/result/ImageTags";
import { SignalsRow } from "../components/result/SignalsRow";
import { Skeleton } from "../components/ui/Skeleton";

// Full result page, per 03-result-detail-ai.html (complete / AI),
// 04-verdict-variants.html (three variants), and
// 05-pending-and-disagreement.html (partial-pending skeletons +
// disagreement banner above verdict).
//
// Mobile: single column, verdict first.
// Desktop: 2-col grid (1.15fr / 1fr) with image+heatmap on the left
// and verdict+agreement+indicators on the right; reasoning and
// recommendations span full width below.

type Props = {
  scan: Scan;
};

export function ResultPage({ scan }: Props) {
  const showDisagreement =
    scan.analysis.status === "ready" &&
    scan.analysis.agreement === "disagreement";

  const verdictLabel: VerdictLabel | null =
    scan.verdict.status === "ready" ? scan.verdict.label : null;

  return (
    <div className="mx-auto max-w-[1000px] px-5 pt-3 pb-6 md:px-10 md:pt-6 md:pb-10">
      <header className="mb-4">
        <p className="text-[11px] uppercase tracking-[0.3px] text-ink/55">
          Result
        </p>
        <h1 className="mt-1 text-[20px] font-medium leading-[1.2] md:text-[22px]">
          {scan.filename}
        </h1>
        <p className="mt-0.5 text-[11px] text-ink/55">
          Scanned {formatRelative(scan.createdAt)}
        </p>
      </header>

      {/* Disagreement banner sits above the verdict per the brief:
       *   uncertain-fill + uncertain-accent border + warning triangle.
       *   Copy is hardcoded per the mockup. */}
      {showDisagreement && <DisagreementBanner />}

      {/* Main 2-col grid on desktop; stacked on mobile. */}
      <div className="grid gap-4 md:grid-cols-[1.15fr_1fr] md:gap-[22px]">
        {/* LEFT: image + heatmap controls + image tags */}
        <div className="flex flex-col gap-[14px] md:order-1">
          <HeatmapTab
            scanId={scan.id}
            preview={scan.preview}
            heatmap={scan.heatmap}
          />

          {scan.analysis.status === "ready" &&
            scan.analysis.imageTags.length > 0 && (
              <section aria-labelledby="tags-heading">
                <h2
                  id="tags-heading"
                  className="mb-[7px] text-[11px] uppercase tracking-[0.2px] text-ink/55"
                >
                  Image tags
                </h2>
                <ImageTags tags={scan.analysis.imageTags} />
              </section>
            )}
          {scan.analysis.status === "pending" && (
            <section>
              <p className="mb-[7px] text-[11px] uppercase tracking-[0.2px] text-ink/55">
                Image tags
              </p>
              <div className="flex flex-wrap gap-1.5">
                <Skeleton className="h-[22px] w-14 rounded-[12px]" />
                <Skeleton className="h-[22px] w-[72px] rounded-[12px]" />
                <Skeleton className="h-[22px] w-[62px] rounded-[12px]" />
                <Skeleton className="h-[22px] w-[78px] rounded-[12px]" />
              </div>
            </section>
          )}
        </div>

        {/* RIGHT: verdict banner + (pending pill?) + agreement + indicators */}
        <div className="flex flex-col gap-[15px] md:order-2">
          <VerdictBanner verdict={scan.verdict} />

          {/* Analysis-pill: shown only when the verdict is ready but
           *  analysis is still loading (the partial → complete window). */}
          {scan.state === "partial" && scan.analysis.status === "pending" && (
            <AnalysisPending />
          )}

          {scan.analysis.status === "ready" ? (
            <>
              <AgreementRow agreement={scan.analysis.agreement} />
              <section aria-labelledby="indicators-heading">
                <h2
                  id="indicators-heading"
                  className="mb-[9px] text-[13px] font-medium"
                >
                  {scan.analysis.agreement === "disagreement"
                    ? "Conflicting signals"
                    : "Key indicators"}
                </h2>
                <KeyIndicators
                  items={scan.analysis.keyIndicators}
                  verdict={verdictLabel}
                  showHead={scan.analysis.agreement === "disagreement"}
                />
              </section>
            </>
          ) : scan.analysis.status === "pending" ? (
            <AnalysisSkeleton />
          ) : (
            <p className="text-sm text-ink/55">
              Detailed analysis unavailable for this image.
            </p>
          )}
        </div>
      </div>

      {/* Full-width: reasoning */}
      {scan.analysis.status === "ready" && scan.analysis.reasoning && (
        <section
          aria-labelledby="reasoning-heading"
          className="mt-4 rounded-[11px] border border-border bg-white px-[17px] py-[15px]"
        >
          <h2
            id="reasoning-heading"
            className="mb-[9px] text-[11px] uppercase tracking-[0.2px] text-ink/55"
          >
            Reasoning
          </h2>
          <p className="whitespace-pre-line text-[13px] leading-[1.6] text-ink">
            {scan.analysis.reasoning}
          </p>
        </section>
      )}
      {scan.analysis.status === "pending" && (
        <div className="mt-4 rounded-[11px] border border-border bg-white px-[17px] py-[15px]">
          <p className="mb-[9px] text-[11px] uppercase tracking-[0.2px] text-ink/55">
            Reasoning
          </p>
          <div className="flex flex-col gap-[7px]">
            <Skeleton className="h-[11px] w-full rounded" />
            <Skeleton className="h-[11px] w-[92%] rounded" />
            <Skeleton className="h-[11px] w-[64%] rounded" />
          </div>
        </div>
      )}

      {/* Full-width: recommendations */}
      {scan.analysis.status === "ready" &&
        scan.analysis.recommendations.length > 0 && (
          <section
            aria-labelledby="recommendations-heading"
            className="mt-[13px] rounded-[11px] border border-border bg-paper px-[17px] py-[15px]"
          >
            <h2
              id="recommendations-heading"
              className="mb-[11px] text-[11px] uppercase tracking-[0.2px] text-ink/55"
            >
              Recommended next steps
            </h2>
            <ol className="flex flex-col gap-[9px]">
              {scan.analysis.recommendations.map((r, i) => (
                <li key={i} className="flex items-start gap-[11px]">
                  <span
                    aria-hidden
                    className="mt-[1px] flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-cobalt-soft text-[11px] font-medium text-cobalt"
                  >
                    {i + 1}
                  </span>
                  <p className="text-[12px] leading-[1.5]">{r}</p>
                </li>
              ))}
            </ol>
          </section>
        )}

      {/* Signals (not in mockup — kept for MVP; quiet styling). */}
      <section className="mt-4" aria-labelledby="signals-heading">
        <h2
          id="signals-heading"
          className="mb-2 text-[11px] font-medium uppercase tracking-[0.2px] text-ink/55"
        >
          Signals
        </h2>
        <SignalsRow signals={scan.signals} />
      </section>
    </div>
  );
}

function DisagreementBanner() {
  return (
    <div
      role="alert"
      className="mb-[15px] flex items-start gap-[11px] rounded-[11px] border border-uncertain-accent bg-uncertain-fill px-[15px] py-3 text-uncertain-ink"
    >
      <AlertTriangle
        className="mt-[1px] h-[15px] w-[15px] flex-shrink-0"
        strokeWidth={1.5}
        aria-hidden
      />
      <div>
        <p className="mb-0.5 text-[12px] font-medium">
          Our detectors disagreed on this image
        </p>
        <p className="text-[11px] leading-[1.5] opacity-85">
          Treat this verdict with extra caution. Individual detector signals
          below tell the full story.
        </p>
      </div>
    </div>
  );
}

function AnalysisPending() {
  return (
    <div className="flex items-center gap-[9px] rounded-btn bg-paper-alt px-3 py-[9px]">
      <Loader2
        className="h-3.5 w-3.5 flex-shrink-0 animate-spin text-cobalt"
        strokeWidth={1.5}
        aria-hidden
      />
      <p className="text-[11px] text-ink/75">
        Running deeper analysis · usually 15–30s
      </p>
    </div>
  );
}

function AnalysisSkeleton() {
  return (
    <>
      {/* Agreement skeleton row */}
      <div className="flex items-center justify-between rounded-[10px] border border-border bg-white px-[14px] py-[11px]">
        <div>
          <p className="mb-0.5 text-[11px] uppercase tracking-[0.2px] text-ink/55">
            Detector agreement
          </p>
          <Skeleton className="mt-0.5 h-[14px] w-[66px] rounded" />
        </div>
        <div aria-hidden className="flex gap-[3px]">
          <Skeleton className="h-[14px] w-[6px] rounded-[2px]" />
          <Skeleton className="h-[14px] w-[6px] rounded-[2px]" />
          <Skeleton className="h-[14px] w-[6px] rounded-[2px]" />
          <Skeleton className="h-[14px] w-[6px] rounded-[2px]" />
        </div>
      </div>
      <section>
        <p className="mb-[9px] text-[13px] font-medium">Key indicators</p>
        <ul className="flex flex-col gap-1.5">
          {["w-[72%]", "w-[58%]", "w-[84%]"].map((w) => (
            <li
              key={w}
              className="rounded-r-btn border border-border border-l-[3px] border-l-border bg-white px-[13px] py-[10px]"
            >
              <Skeleton className={`h-[13px] rounded ${w}`} />
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
