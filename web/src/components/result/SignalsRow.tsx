import { Camera, FileCode, Stamp } from "lucide-react";
import type { Signals } from "@verify/shared";

import { formatPercent } from "../../lib/format";

// Side-channel observations from TruthScan's metadata/warnings. These
// are NOT the verdict — they're supporting context. Quiet styling on
// purpose. Watermark renders both label and detection confidence so
// we don't drop information from the warning.

type Props = {
  signals: Signals;
};

export function SignalsRow({ signals }: Props) {
  const items: { icon: typeof Camera; label: string; detail?: string }[] = [
    {
      icon: FileCode,
      label: signals.hasExif ? "EXIF present" : "No EXIF",
      detail: signals.hasExif
        ? "Camera metadata attached"
        : "No camera metadata",
    },
    {
      icon: Camera,
      label: signals.screenRecapture ? "Screen recapture" : "No screen recapture",
      detail: signals.screenRecapture
        ? "Looks photographed from a screen"
        : undefined,
    },
  ];

  if (signals.watermark) {
    items.push({
      icon: Stamp,
      label: `${signals.watermark.label} watermark`,
      detail: `${formatPercent(signals.watermark.confidence, 0)} confidence`,
    });
  }

  return (
    <dl className="grid grid-cols-1 gap-2 sm:grid-cols-3">
      {items.map((i, idx) => (
        <div
          key={idx}
          className="flex items-start gap-2 rounded-card border border-paper-edge bg-paper px-3 py-2"
        >
          <i.icon
            className="mt-0.5 h-4 w-4 flex-shrink-0 text-ink-muted"
            aria-hidden
          />
          <div className="min-w-0">
            <dt className="truncate text-xs font-medium">{i.label}</dt>
            {i.detail && (
              <dd className="truncate text-xs text-ink-muted">{i.detail}</dd>
            )}
          </div>
        </div>
      ))}
    </dl>
  );
}
