import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Scan } from "@verify/shared";

import { ApiError, getScans } from "../lib/api";
import { resolveErrorCopy } from "../lib/errors";
import { runUpload } from "../lib/upload";
import { Banner } from "../components/ui/Banner";
import { EmptyState } from "../components/history/EmptyState";
import { ScanRow } from "../components/history/ScanRow";
import { ScanButton } from "../components/scan/ScanButton";
import { UploadArea } from "../components/scan/UploadArea";

// Home screen matching 01-home.html. Mobile column: eyebrow → title
// → upload-area → full-width CTA → recent scans. Desktop: same column
// but the upload area and CTA sit in a 1fr/180px grid row so the
// cobalt CTA stretches to the full upload area height. Soft-delete /
// trash controls and the dedicated quota/error screens arrive later.

type UploadState =
  | { kind: "idle" }
  | { kind: "running" }
  | { kind: "error"; headline: string; message: string };

export function HomePage() {
  const navigate = useNavigate();
  const [file, setFile] = useState<File | null>(null);
  const [upload, setUpload] = useState<UploadState>({ kind: "idle" });
  const [scans, setScans] = useState<Scan[] | null>(null);
  const [scansError, setScansError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getScans({ limit: 20 })
      .then((res) => !cancelled && setScans(res.scans))
      .catch(() => !cancelled && setScansError("Couldn't load your scan history."));
    return () => {
      cancelled = true;
    };
  }, []);

  const startScan = async () => {
    if (!file) return;
    setUpload({ kind: "running" });
    try {
      const { scanId } = await runUpload(file);
      navigate(`/scan/${encodeURIComponent(scanId)}`);
    } catch (e) {
      const { headline, body } =
        e instanceof ApiError
          ? resolveErrorCopy(e.code, e.message)
          : { headline: "Something went wrong", body: "Please try again." };
      setUpload({ kind: "error", headline, message: body });
    }
  };

  return (
    <div className="mx-auto max-w-[840px] px-5 pt-2 pb-3.5 md:px-10 md:py-8">
      <header className="mb-[14px] md:mb-[18px]">
        <p className="mb-1.5 text-[11px] uppercase tracking-[0.3px] text-ink/55">
          AI detection
        </p>
        <h1 className="text-[20px] font-medium leading-[1.2] md:text-[24px]">
          Check for AI
        </h1>
      </header>

      {upload.kind === "error" && (
        <div className="mb-3">
          <Banner kind="error" headline={upload.headline}>
            {upload.message}
          </Banner>
        </div>
      )}

      {/* Mobile: stacked. Desktop: upload + CTA side-by-side (1fr 180px). */}
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
          />
        </div>
      </div>

      <section aria-labelledby="history-heading" className="mt-8 md:mt-0">
        <div className="mb-2.5 flex items-baseline justify-between md:mb-3">
          <h2
            id="history-heading"
            className="text-[13px] font-medium md:text-[14px]"
          >
            Recent scans
          </h2>
          {scans && scans.length > 0 && (
            <a
              href="/history"
              className="text-[12px] text-cobalt hover:underline"
            >
              See all
            </a>
          )}
        </div>
        {scansError && <Banner kind="info">{scansError}</Banner>}
        {!scansError && scans === null && (
          <div className="text-sm text-ink/55">Loading…</div>
        )}
        {!scansError && scans?.length === 0 && (
          <EmptyState
            title="No scans yet"
            body="Your first scan will show up here."
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
