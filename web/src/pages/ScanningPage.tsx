import { Loader2 } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";

import { Banner } from "../components/ui/Banner";
import { Button } from "../components/ui/Button";
import { resolveErrorCopy } from "../lib/errors";
import { useScan } from "../lib/polling";
import { ResultPage } from "./ResultPage";

// The /scan/:id route. Owns the polling loop via useScan and swaps
// between three views driven by the scan's top-level `state`:
//
//   - polling  → "Analyzing image" spinner
//   - partial  → ResultPage (with skeletons for the still-loading bits)
//   - complete → ResultPage (fully populated)
//   - error    → an inline error panel for now; step 7 routes to the
//                dedicated full-page ErrorPage per ERRORS.md surfaces.
//
// SCAN_NOT_FOUND and SCAN_TIMEOUT surface via hook.error — both are
// terminal, no retry from here (step 7 wires the retry action).

export function ScanningPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const scanId = id ?? "";
  const { scan, error } = useScan(scanId);

  if (error) {
    const { headline, body } = resolveErrorCopy(error.code, error.message);
    return (
      <div className="mx-auto max-w-2xl px-4 py-10 md:px-8 md:py-16">
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
    return <ScanningState />;
  }

  if (scan.state === "error") {
    const code = scan.error?.code ?? "SCAN_FAILED";
    const { headline, body } = resolveErrorCopy(code, scan.error?.message);
    return (
      <div className="mx-auto max-w-2xl px-4 py-10 md:px-8 md:py-16">
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

function ScanningState() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center justify-center gap-4 px-4 py-16 text-center md:py-24">
      <Loader2 className="h-8 w-8 animate-spin text-cobalt" aria-hidden />
      <div>
        <div className="text-lg font-semibold">Analyzing image</div>
        <p className="mt-1 text-sm text-ink-muted">
          This usually takes 5–15 seconds.
        </p>
      </div>
    </div>
  );
}
