import { ImageOff } from "lucide-react";
import { useState } from "react";
import type { Heatmap, Preview } from "@verify/shared";

import { Skeleton } from "../ui/Skeleton";
import { Tabs } from "../ui/Tab";

// Image tabs: Original view + Heatmap view. On the Heatmap tab with
// status=ready mode=transparent, stack the transparent heatmap PNG
// over the preview with a user-controlled opacity — this is the
// client-side compositing the architecture calls for. Canvas would be
// over-engineering: the alpha channel already encodes heat vs.
// non-heat, so CSS opacity on the top <img> multiplies cleanly.
//
// status=skipped and status=failed both render a muted placeholder
// (per ERRORS.md heatmap skipped/unavailable). They're never a spinner.
// Default tab stays Original.

type TabId = "original" | "heatmap";

type Props = {
  scanId: string;
  preview: Preview;
  heatmap: Heatmap;
};

const DEFAULT_OPACITY = 0.6;

export function HeatmapTab({ preview, heatmap }: Props) {
  const [active, setActive] = useState<TabId>("original");
  const [opacity, setOpacity] = useState<number>(DEFAULT_OPACITY);

  return (
    <section className="rounded-card border border-border bg-paper overflow-hidden">
      <Tabs
        tabs={[
          { id: "original", label: "Original" },
          { id: "heatmap", label: "Heatmap" },
        ] as const}
        active={active}
        onChange={(id: TabId) => setActive(id)}
        ariaLabel="Image view"
      />
      <div className="p-4">
        {active === "original" ? (
          <PreviewImage preview={preview} />
        ) : (
          <HeatmapView
            preview={preview}
            heatmap={heatmap}
            opacity={opacity}
            onOpacityChange={setOpacity}
          />
        )}
      </div>
    </section>
  );
}

function PreviewImage({ preview }: { preview: Preview }) {
  if (preview.status === "pending") {
    return <Skeleton className="aspect-square w-full" />;
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
  onOpacityChange,
}: {
  preview: Preview;
  heatmap: Heatmap;
  opacity: number;
  onOpacityChange: (v: number) => void;
}) {
  if (heatmap.status === "pending") {
    return <Skeleton className="aspect-square w-full" />;
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

  // status === "ready". Two-img composite needs the preview too — if
  // preview failed or is pending, render the heatmap alone. For
  // mode="overlayed" (future flag; the Worker currently always asks
  // for transparent) render it alone with no slider.
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
    <div>
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
      <label className="mt-4 block">
        <span className="mb-1 block text-xs text-ink/55">
          Heatmap opacity · {Math.round(opacity * 100)}%
        </span>
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={Math.round(opacity * 100)}
          onChange={(e) => onOpacityChange(Number(e.target.value) / 100)}
          aria-label="Heatmap opacity"
          className="w-full accent-cobalt"
        />
      </label>
    </div>
  );
}

function Placeholder({ text, subtext }: { text: string; subtext?: string }) {
  return (
    <div className="flex aspect-square w-full flex-col items-center justify-center gap-2 rounded-card bg-paper-alt px-6 text-center text-ink/55">
      <ImageOff className="h-6 w-6" aria-hidden />
      <div className="text-sm font-medium text-ink">{text}</div>
      {subtext && <p className="max-w-xs text-xs">{subtext}</p>}
    </div>
  );
}
