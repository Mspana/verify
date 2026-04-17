import { AlertTriangle } from "lucide-react";
import type { Scan } from "@verify/shared";

import { formatRelative } from "../lib/format";
import { AgreementRow } from "../components/verdict/AgreementRow";
import { KeyIndicators } from "../components/verdict/KeyIndicators";
import { VerdictBanner } from "../components/verdict/VerdictBanner";
import { HeatmapTab } from "../components/result/HeatmapTab";
import { ImageTags } from "../components/result/ImageTags";
import { SignalsRow } from "../components/result/SignalsRow";
import { Skeleton } from "../components/ui/Skeleton";

// The scan result page. Composed by ScanningPage once scan.state flips
// to `partial` or `complete`; state transitions happen in place so the
// user sees verdict → full details progressively without a navigation.
//
// Pending/ready/skipped/failed are handled at each section's own level.
// Analysis failing or being skipped never hides the verdict — that's
// the ERRORS.md "partial success is success" contract: verdict is the
// product, analysis is the bonus.

type Props = {
  scan: Scan;
};

export function ResultPage({ scan }: Props) {
  const showDisagreement =
    scan.analysis.status === "ready" &&
    scan.analysis.agreement === "disagreement";

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 md:px-8 md:py-12">
      <header className="mb-4">
        <h1 className="truncate text-lg font-medium text-ink-muted">
          {scan.filename}
        </h1>
        <p className="mt-0.5 text-xs text-ink-muted">
          Scanned {formatRelative(scan.createdAt)}
        </p>
      </header>

      <VerdictBanner verdict={scan.verdict} />

      {showDisagreement && (
        <div
          role="alert"
          className="mt-4 flex items-start gap-3 rounded-card border border-human-accent/30 bg-human-fill px-4 py-3 text-sm text-human-accent"
        >
          <AlertTriangle
            className="mt-0.5 h-4 w-4 flex-shrink-0"
            aria-hidden
          />
          <div>
            <div className="font-medium">Signals disagree</div>
            <p className="mt-0.5 opacity-90">
              TruthScan's detection signals conflict on this image. Interpret
              the verdict with caution — see the indicators below for where
              they diverge.
            </p>
          </div>
        </div>
      )}

      <div className="mt-6">
        <HeatmapTab
          scanId={scan.id}
          preview={scan.preview}
          heatmap={scan.heatmap}
        />
      </div>

      {scan.analysis.status === "ready" && (
        <>
          <div className="mt-6">
            <AgreementRow agreement={scan.analysis.agreement} />
          </div>

          {scan.analysis.imageTags.length > 0 && (
            <section className="mt-6" aria-labelledby="tags-heading">
              <h2 id="tags-heading" className="sr-only">
                Image tags
              </h2>
              <ImageTags tags={scan.analysis.imageTags} />
            </section>
          )}

          <section className="mt-6" aria-labelledby="indicators-heading">
            <h2 id="indicators-heading" className="mb-2 text-sm font-semibold">
              Key indicators
            </h2>
            <KeyIndicators items={scan.analysis.keyIndicators} />
          </section>

          {scan.analysis.reasoning && (
            <section className="mt-6" aria-labelledby="reasoning-heading">
              <h2
                id="reasoning-heading"
                className="mb-2 text-sm font-semibold"
              >
                Reasoning
              </h2>
              <p className="whitespace-pre-line text-sm leading-relaxed text-ink">
                {scan.analysis.reasoning}
              </p>
            </section>
          )}

          {scan.analysis.recommendations.length > 0 && (
            <section className="mt-6" aria-labelledby="recommendations-heading">
              <h2
                id="recommendations-heading"
                className="mb-2 text-sm font-semibold"
              >
                What to do
              </h2>
              <ul className="flex list-disc flex-col gap-1 pl-5 text-sm leading-relaxed">
                {scan.analysis.recommendations.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      {scan.analysis.status === "pending" && <AnalysisSkeleton />}

      {(scan.analysis.status === "failed" ||
        scan.analysis.status === "skipped") && (
        <p className="mt-6 text-sm text-ink-muted">
          Detailed analysis unavailable for this image.
        </p>
      )}

      <section className="mt-8" aria-labelledby="signals-heading">
        <h2
          id="signals-heading"
          className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted"
        >
          Signals
        </h2>
        <SignalsRow signals={scan.signals} />
      </section>
    </div>
  );
}

function AnalysisSkeleton() {
  return (
    <div className="mt-6 flex flex-col gap-4">
      <Skeleton className="h-20 w-full" />
      <Skeleton className="h-6 w-2/3" />
      <div className="flex flex-col gap-2">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-5/6" />
      </div>
      <Skeleton className="h-24 w-full" />
    </div>
  );
}
