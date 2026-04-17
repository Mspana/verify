import { ImageOff } from "lucide-react";
import { useState } from "react";
import type { Heatmap, Preview } from "@verify/shared";

import { Skeleton } from "../ui/Skeleton";
import { Tabs } from "../ui/Tab";

// Image + heatmap control, matching 03-result-detail-ai.html
// .heatmap-control:
//
//   [ Original ][ Heatmap ]    ← segmented tab-switcher in paper-alt track
//   Overlay  ——●——  65%         ← slider row inline
//   small caption text          ← describes what the overlay shows
//
// On the Heatmap tab with status=ready + mode=transparent we stack a
// transparent heatmap PNG over the preview with a user-controlled
// opacity; the alpha channel already encodes heat vs. non-heat, so
// CSS opacity multiplies cleanly without needing canvas.
// Status skipped/failed shows a muted placeholder tile — never spinner.

type TabId = "original" | "heatmap";

type Props = {
  scanId: string;
  preview: Preview;
  heatmap: Heatmap;
};

const DEFAULT_OPACITY = 0.65;

export function HeatmapTab({ preview, heatmap }: Props) {
  const [active, setActive] = useState<TabId>("original");
  const [opacity, setOpacity] = useState<number>(DEFAULT_OPACITY);

  return (
    <div className="flex flex-col gap-[14px]">
      <ImageFrame preview={preview} heatmap={heatmap} showHeatmap={active === "heatmap"} opacity={opacity} />

      <div className="rounded-[11px] border border-border bg-white px-[14px] py-[13px]">
        <div className="mb-[13px]">
          <Tabs
            tabs={[
              { id: "original", label: "Original" },
              { id: "heatmap", label: "Heatmap" },
            ] as const}
            active={active}
            onChange={(id: TabId) => setActive(id)}
            ariaLabel="Image view"
          />
        </div>
        {active === "heatmap" && heatmap.status === "ready" && heatmap.mode === "transparent" ? (
          <>
            <div className="flex items-center gap-[11px]">
              <label
                htmlFor="heatmap-opacity"
                className="min-w-[56px] text-[11px] text-ink/55"
              >
                Overlay
              </label>
              <input
                id="heatmap-opacity"
                type="range"
                min={0}
                max={100}
                step={1}
                value={Math.round(opacity * 100)}
                onChange={(e) => setOpacity(Number(e.target.value) / 100)}
                aria-label="Heatmap opacity"
                className="flex-1 accent-cobalt"
              />
              <span className="min-w-[30px] text-right text-[11px] text-ink/75 tabular-nums">
                {Math.round(opacity * 100)}%
              </span>
            </div>
            <p className="mt-[9px] text-[10px] text-ink/55">
              Red areas show where the detector found AI patterns.
            </p>
          </>
        ) : (
          <p className="text-[11px] text-ink/55">
            Switch to the Heatmap tab to see where detectors looked.
          </p>
        )}
      </div>
    </div>
  );
}

function ImageFrame({
  preview,
  heatmap,
  showHeatmap,
  opacity,
}: {
  preview: Preview;
  heatmap: Heatmap;
  showHeatmap: boolean;
  opacity: number;
}) {
  if (showHeatmap) {
    return <HeatmapView preview={preview} heatmap={heatmap} opacity={opacity} />;
  }
  return <PreviewImage preview={preview} />;
}

function PreviewImage({ preview }: { preview: Preview }) {
  if (preview.status === "pending") {
    return <Skeleton className="aspect-[4/3] w-full rounded-card" />;
  }
  if (preview.status === "failed") {
    return <Placeholder text="Preview unavailable" />;
  }
  return (
    <img
      src={preview.url}
      alt="Uploaded image"
      className="block w-full rounded-card bg-paper-alt"
    />
  );
}

function HeatmapView({
  preview,
  heatmap,
  opacity,
}: {
  preview: Preview;
  heatmap: Heatmap;
  opacity: number;
}) {
  if (heatmap.status === "pending") {
    return <Skeleton className="aspect-[4/3] w-full rounded-card" />;
  }
  if (heatmap.status === "skipped") {
    return (
      <Placeholder
        text="Heatmap not available for this image"
        subtext="TruthScan doesn't generate one when the verdict is clear. The verdict is still accurate."
      />
    );
  }
  if (heatmap.status === "failed") {
    return (
      <Placeholder
        text="Heatmap unavailable"
        subtext="The verdict is still accurate. The visual breakdown couldn't be generated for this image."
      />
    );
  }

  const previewReady = preview.status === "ready";
  const canComposite = heatmap.mode === "transparent" && previewReady;

  if (!canComposite) {
    return (
      <img
        src={heatmap.url}
        alt="Heatmap"
        className="block w-full rounded-card bg-paper-alt"
      />
    );
  }

  return (
    <div className="relative">
      <img
        src={previewReady ? preview.url : ""}
        alt="Uploaded image"
        className="block w-full rounded-card bg-paper-alt"
      />
      <img
        src={heatmap.url}
        alt="Heatmap overlay"
        style={{ opacity }}
        className="pointer-events-none absolute inset-0 h-full w-full rounded-card"
      />
    </div>
  );
}

function Placeholder({ text, subtext }: { text: string; subtext?: string }) {
  return (
    <div className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-2 rounded-card bg-paper-alt px-6 text-center text-ink/55">
      <ImageOff className="h-6 w-6" aria-hidden />
      <div className="text-sm font-medium text-ink">{text}</div>
      {subtext && <p className="max-w-xs text-xs">{subtext}</p>}
    </div>
  );
}
