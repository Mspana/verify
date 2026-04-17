import type { Scan } from "@verify/shared";

import { formatRelative } from "../lib/format";
import { VerdictPill } from "../components/verdict/VerdictPill";

// Thin placeholder — step 5 fills this in with the verdict banner,
// agreement row, key indicators, heatmap tab, signals, and all the
// pending skeletons. For step 4 it just needs to render *something*
// different from the scanning screen so the polling transition is
// observable end to end.
//
// Note: this is not a route — ScanningPage renders it inline once the
// scan state flips to partial/complete. Keeping the transition in one
// component means mid-scan nav-away/come-back doesn't lose anything.

type Props = {
  scan: Scan;
};

export function ResultPage({ scan }: Props) {
  return (
    <div className="mx-auto max-w-2xl px-4 py-6 md:px-8 md:py-12">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold">{scan.filename}</h1>
          <p className="mt-1 text-xs text-ink-muted">
            {formatRelative(scan.createdAt)}
          </p>
        </div>
        <VerdictPill verdict={scan.verdict} />
      </header>

      {scan.state === "partial" && (
        <p className="text-sm text-ink-muted">
          Verdict ready. Analysis still loading…
        </p>
      )}
      {scan.state === "complete" && (
        <p className="text-sm text-ink-muted">
          Full result UI lands in step 5.
        </p>
      )}
    </div>
  );
}
