import { Camera, FileCode, Stamp } from "lucide-react";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();
  const items: { icon: typeof Camera; label: string; detail?: string }[] = [
    {
      icon: FileCode,
      label: signals.hasExif ? t("signals.exifPresent") : t("signals.exifMissing"),
      detail: signals.hasExif
        ? t("signals.exifPresentDetail")
        : t("signals.exifMissingDetail"),
    },
    {
      icon: Camera,
      label: signals.screenRecapture
        ? t("signals.screenRecapture")
        : t("signals.noScreenRecapture"),
      detail: signals.screenRecapture
        ? t("signals.screenRecaptureDetail")
        : undefined,
    },
  ];

  if (signals.watermark) {
    items.push({
      icon: Stamp,
      label: t("signals.watermarkLabel", { label: signals.watermark.label }),
      detail: t("signals.watermarkDetail", {
        value: formatPercent(signals.watermark.confidence, 0),
      }),
    });
  }

  return (
    <dl className="grid grid-cols-1 gap-2 sm:grid-cols-3">
      {items.map((i, idx) => (
        <div
          key={idx}
          className="flex items-start gap-2 rounded-card border border-border bg-paper px-3 py-2"
        >
          <i.icon
            className="mt-0.5 h-4 w-4 flex-shrink-0 text-ink/55"
            aria-hidden
          />
          <div className="min-w-0">
            <dt className="truncate text-xs font-medium">{i.label}</dt>
            {i.detail && (
              <dd className="truncate text-xs text-ink/55">{i.detail}</dd>
            )}
          </div>
        </div>
      ))}
    </dl>
  );
}
