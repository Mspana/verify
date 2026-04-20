import { ImageOff } from "lucide-react";
import { useEffect, useId, useState } from "react";
import type { Heatmap, Preview } from "@verify/shared";

import { Skeleton } from "../ui/Skeleton";
import { Tabs } from "../ui/Tab";

// Image + heatmap control.
//
//   [ Original ][ Heatmap ]    ← segmented tab-switcher (ARIA tablist)
//   ┌─────────────────────┐
//   │       image         │   ← tabpanel: one DOM element; content
//   └─────────────────────┘     swaps between Original preview and
//   Red areas show …             Heatmap composite / placeholder.
//                                Caption only appears on the Heatmap
//                                tab — it explains what the colors
//                                mean and is meaningless on Original.
//
// Heatmap tab states:
//   ready + transparent → composite preview + heatmap at 75% opacity
//                         (fixed; no slider — the value wasn't earning
//                         its vertical real estate)
//   ready + overlayed   → heatmap alone (future flag path)
//   pending             → skeleton (wait for polling to resolve)
//   skipped / failed    → preview rendered grayscale with a paper/90
//                         pill on top
//
// Keyboard:
//   - Arrow / Home / End traverse tabs (W3C pattern, handled by Tabs).
//   - 'H' toggles Original ↔ Heatmap globally while this component is
//     mounted. Undocumented power-user shortcut; no UI hint. Guarded
//     against firing inside form inputs and against modifier-key
//     combos so browser shortcuts and text typing still work.

type TabId = "original" | "heatmap";

type Props = {
  scanId: string;
  preview: Preview;
  heatmap: Heatmap;
};

/** Fixed heatmap overlay opacity — replaces the user-controlled slider. */
const HEATMAP_OPACITY = 0.75;

export function HeatmapTab({ preview, heatmap }: Props) {
  const [active, setActive] = useState<TabId>("original");

  // Stable ids for ARIA wiring. One panelId shared by both tabs (the
  // panel swaps contents rather than toggling visibility), per W3C:
  // aria-labelledby on the panel points to the currently-active tab.
  const idPrefix = useId();
  const panelId = `${idPrefix}panel`;
  const originalTabId = `${idPrefix}tab-original`;
  const heatmapTabId = `${idPrefix}tab-heatmap`;
  const activeTabId = active === "original" ? originalTabId : heatmapTabId;

  // 'H' shortcut: scoped by this effect's lifetime. When HeatmapTab
  // unmounts (user navigates away from a result), the listener goes
  // with it — no global leak.
  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      // Don't eat the keystroke while the user is typing.
      const target = e.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement
      ) {
        return;
      }
      if (e.key.toLowerCase() !== "h") return;
      setActive((prev) => (prev === "original" ? "heatmap" : "original"));
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, []);

  return (
    <div className="flex flex-col gap-[14px]">
      <div
        role="tabpanel"
        id={panelId}
        aria-labelledby={activeTabId}
        tabIndex={0}
        className="focus:outline-none"
      >
        <ImageFrame
          preview={preview}
          heatmap={heatmap}
          showHeatmap={active === "heatmap"}
        />
        {active === "heatmap" && (
          <p className="mt-2 text-[10px] text-ink/55">
            Red areas show where the detector found AI patterns.
          </p>
        )}
      </div>

      <div className="rounded-[11px] border border-border bg-white px-[14px] py-[13px]">
        <Tabs
          tabs={[
            {
              id: "original",
              label: "Original",
              tabId: originalTabId,
              panelId,
            },
            {
              id: "heatmap",
              label: "Heatmap",
              tabId: heatmapTabId,
              panelId,
            },
          ] as const}
          active={active}
          onChange={(id: TabId) => setActive(id)}
          ariaLabel="Image view"
        />
      </div>
    </div>
  );
}

function ImageFrame({
  preview,
  heatmap,
  showHeatmap,
}: {
  preview: Preview;
  heatmap: Heatmap;
  showHeatmap: boolean;
}) {
  if (showHeatmap) {
    return <HeatmapView preview={preview} heatmap={heatmap} />;
  }
  return <PreviewImage preview={preview} />;
}

function PreviewImage({ preview }: { preview: Preview }) {
  if (preview.status === "pending") {
    return <Skeleton className="aspect-[4/3] w-full rounded-card" />;
  }
  if (preview.status === "failed") {
    return (
      <PlaceholderTile
        text="Preview unavailable"
        subtext="The scan is still available — we just couldn't load the thumbnail."
      />
    );
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
}: {
  preview: Preview;
  heatmap: Heatmap;
}) {
  if (heatmap.status === "pending") {
    return <Skeleton className="aspect-[4/3] w-full rounded-card" />;
  }
  if (heatmap.status === "skipped") {
    return (
      <UnavailableOverPreview
        preview={preview}
        headline="Heatmap not available for this image"
        body="TruthScan doesn't generate one when the verdict is clear. The verdict is still accurate."
      />
    );
  }
  if (heatmap.status === "failed") {
    return (
      <UnavailableOverPreview
        preview={preview}
        headline="Heatmap unavailable"
        body="The verdict is still accurate. The visual breakdown couldn't be generated for this image."
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
        style={{ opacity: HEATMAP_OPACITY }}
        className="pointer-events-none absolute inset-0 h-full w-full rounded-card"
      />
    </div>
  );
}

/**
 * Grayscale-desaturated preview with a readable message pill centered
 * on top. Used for heatmap.status === "skipped" | "failed" whenever we
 * have a preview image to show. If we don't, fall back to the plain
 * placeholder tile so we don't render a broken <img>.
 */
function UnavailableOverPreview({
  preview,
  headline,
  body,
}: {
  preview: Preview;
  headline: string;
  body: string;
}) {
  if (preview.status !== "ready") {
    return <PlaceholderTile text={headline} subtext={body} />;
  }
  return (
    <div className="relative">
      <img
        src={preview.url}
        alt=""
        className="block w-full rounded-card bg-paper-alt"
        style={{ filter: "grayscale(100%) brightness(0.95)" }}
      />
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-4">
        <div className="max-w-xs rounded-card bg-paper/90 px-4 py-3 text-center shadow-sm backdrop-blur-sm">
          <div className="text-[13px] font-medium text-ink">{headline}</div>
          <p className="mt-0.5 text-[11px] text-ink/55">{body}</p>
        </div>
      </div>
    </div>
  );
}

function PlaceholderTile({
  text,
  subtext,
}: {
  text: string;
  subtext?: string;
}) {
  return (
    <div className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-2 rounded-card bg-paper-alt px-6 text-center text-ink/55">
      <ImageOff className="h-6 w-6" aria-hidden />
      <div className="text-sm font-medium text-ink">{text}</div>
      {subtext && <p className="max-w-xs text-xs">{subtext}</p>}
    </div>
  );
}
