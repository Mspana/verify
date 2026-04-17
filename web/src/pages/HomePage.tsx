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

// Home screen: upload target, bilingual Scan CTA, and the start of the
// history list. Soft-delete/trash controls, delete-with-undo toast, and
// the dedicated quota-exceeded and error full-page screens arrive in
// later steps; for now any ApiError from the upload flow surfaces as
// an inline banner here.

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
      .then((res) => {
        if (!cancelled) setScans(res.scans);
      })
      .catch(() => {
        if (!cancelled) setScansError("Couldn't load your scan history.");
      });
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
    <div className="mx-auto max-w-2xl px-4 py-6 md:px-8 md:py-12">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">扫描 · Scan</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Upload an image to check whether it's AI generated.
        </p>
      </header>

      {upload.kind === "error" && (
        <div className="mb-4">
          <Banner kind="error" headline={upload.headline}>
            {upload.message}
          </Banner>
        </div>
      )}

      <UploadArea
        onFile={(f) => {
          setFile(f);
          setUpload({ kind: "idle" });
        }}
        selectedFile={file}
        disabled={upload.kind === "running"}
      />

      <div className="mt-4 flex justify-end">
        <ScanButton
          onClick={startScan}
          disabled={!file}
          loading={upload.kind === "running"}
        />
      </div>

      <section className="mt-10" aria-labelledby="history-heading">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 id="history-heading" className="text-base font-semibold">
            Recent scans
          </h2>
          {scans && scans.length > 0 && (
            <a href="/history" className="text-xs text-cobalt hover:underline">
              See all
            </a>
          )}
        </div>
        {scansError && (
          <Banner kind="info">{scansError}</Banner>
        )}
        {!scansError && scans === null && (
          <div className="text-sm text-ink-muted">Loading…</div>
        )}
        {!scansError && scans?.length === 0 && (
          <EmptyState
            title="No scans yet"
            body="Your first scan will show up here."
          />
        )}
        {!scansError && scans && scans.length > 0 && (
          <ul className="flex flex-col gap-2">
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
