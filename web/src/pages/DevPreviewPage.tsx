import { Link, useParams } from "react-router-dom";
import type { Scan } from "@verify/shared";

import { ResultPage } from "./ResultPage";

// Dev-only route (mounted in App.tsx under `import.meta.env.DEV`) for
// screenshotting each variant of the result page without round-
// tripping through TruthScan. Each fixture matches a mockup state so
// visual review is easy: /dev/result/ai-complete, human-complete,
// uncertain-complete, partial-pending, ai-disagreement.
//
// Not shipped to production and never linked from the app — the route
// is pure review scaffolding, mounted only in dev builds.

const baseScan = (overrides: Partial<Scan>): Scan => ({
  id: "dev-fixture",
  state: "complete",
  createdAt: "2026-04-17T12:00:00Z",
  filename: "portrait-outdoor.jpg",
  verdict: { status: "pending" },
  preview: { status: "pending" },
  heatmap: { status: "skipped" },
  analysis: { status: "pending" },
  signals: { hasExif: false, screenRecapture: false, watermark: null },
  error: null,
  ...overrides,
});

const FIXTURES: Record<string, Scan> = {
  "ai-complete": baseScan({
    state: "complete",
    verdict: {
      status: "ready",
      label: "ai",
      headline: "AI generated",
      aiLikelihood: 90.2,
      confidence: 91,
    },
    preview: { status: "ready", url: "https://picsum.photos/seed/ai/800/600" },
    heatmap: {
      status: "ready",
      url: "https://picsum.photos/seed/heat/800/600",
      mode: "transparent",
    },
    analysis: {
      status: "ready",
      agreement: "strong",
      imageTags: ["person", "portrait", "outdoor", "vineyard", "smiling"],
      keyIndicators: [
        { label: "Unnaturally smooth skin texture", supports: "verdict" },
        { label: "Consistent lighting anomalies", supports: "verdict" },
        {
          label: "Uniform noise pattern typical of diffusion models",
          supports: "verdict",
        },
        { label: "No EXIF metadata present", supports: "neutral" },
      ],
      reasoning:
        "The image shows clear signs of AI generation with unnaturally smooth textures and consistent lighting patterns not typical of real photography. Multiple detector signals align strongly with known diffusion-model outputs.",
      recommendations: [
        "Cross-reference with original source if available",
        "Check for metadata inconsistencies",
        "Compare with known AI generation patterns",
      ],
    },
    signals: { hasExif: false, screenRecapture: false, watermark: null },
  }),

  "human-complete": baseScan({
    state: "complete",
    filename: "IMG_4821.heic",
    verdict: {
      status: "ready",
      label: "human",
      headline: "Likely real",
      aiLikelihood: 6,
      confidence: 87,
    },
    preview: {
      status: "ready",
      url: "https://picsum.photos/seed/human/800/600",
    },
    heatmap: { status: "skipped" },
    analysis: {
      status: "ready",
      agreement: "strong",
      imageTags: ["landscape", "outdoor", "natural light", "sunset"],
      keyIndicators: [
        { label: "EXIF metadata intact, camera model detected", supports: "verdict" },
        { label: "Natural sensor grain consistent with camera", supports: "verdict" },
        { label: "Organic lighting variations across frame", supports: "verdict" },
      ],
      reasoning:
        "Signals strongly suggest a camera-captured image. EXIF metadata is intact with consistent camera-model fingerprints, and the noise profile matches sensor-level grain rather than generative artifacts.",
      recommendations: [
        "This image reads as authentic",
        "If source is unfamiliar, still verify provenance",
      ],
    },
    signals: {
      hasExif: true,
      screenRecapture: false,
      watermark: null,
    },
  }),

  "uncertain-complete": baseScan({
    state: "complete",
    filename: "storefront.jpg",
    verdict: {
      status: "ready",
      label: "uncertain",
      headline: "Can't verify",
      aiLikelihood: 52,
      confidence: 58,
    },
    preview: {
      status: "ready",
      url: "https://picsum.photos/seed/unc/800/600",
    },
    heatmap: { status: "skipped" },
    analysis: {
      status: "ready",
      agreement: "weak",
      imageTags: ["storefront", "urban"],
      keyIndicators: [
        { label: "Some compression artifacts obscure texture cues", supports: "neutral" },
        { label: "Low resolution limits detector confidence", supports: "neutral" },
      ],
      reasoning:
        "Input quality was too low for our detectors to commit either way. Compression artifacts and a small resolution degrade the signals we rely on.",
      recommendations: [
        "Try a higher-resolution version of the same image",
        "Check whether the original is available without recompression",
      ],
    },
    signals: {
      hasExif: false,
      screenRecapture: true,
      watermark: null,
    },
  }),

  "partial-pending": baseScan({
    state: "partial",
    verdict: {
      status: "ready",
      label: "ai",
      headline: "AI generated",
      aiLikelihood: 90.2,
      confidence: 91,
    },
    preview: {
      status: "ready",
      url: "https://picsum.photos/seed/ai/800/600",
    },
    heatmap: { status: "pending" },
    analysis: { status: "pending" },
    signals: { hasExif: false, screenRecapture: false, watermark: null },
  }),

  "ai-disagreement": baseScan({
    state: "complete",
    filename: "contested.jpg",
    verdict: {
      status: "ready",
      label: "uncertain",
      headline: "Can't verify",
      aiLikelihood: 48,
      confidence: 46,
    },
    preview: {
      status: "ready",
      url: "https://picsum.photos/seed/dis/800/600",
    },
    heatmap: {
      status: "ready",
      url: "https://picsum.photos/seed/heat/800/600",
      mode: "transparent",
    },
    analysis: {
      status: "ready",
      agreement: "disagreement",
      imageTags: ["person", "portrait"],
      keyIndicators: [
        { label: "Smooth texture in skin regions", supports: "opposite" },
        { label: "EXIF metadata intact, camera model detected", supports: "verdict" },
        { label: "Natural grain consistent with camera sensor", supports: "verdict" },
      ],
      reasoning:
        "Detector signals pointed in different directions on this image. Strong signals both for and against AI generation were present; the final verdict leans uncertain until a tiebreak signal appears.",
      recommendations: [
        "Look up the image's provenance if possible",
        "Seek a second opinion from an independent detector",
      ],
    },
    signals: {
      hasExif: true,
      screenRecapture: false,
      watermark: null,
    },
  }),
};

const VARIANTS = Object.keys(FIXTURES);

export function DevPreviewPage() {
  const { variant = "ai-complete" } = useParams<{ variant: string }>();
  const scan = FIXTURES[variant];

  if (!scan) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-10">
        <h1 className="text-xl font-medium">Unknown fixture: {variant}</h1>
        <ul className="mt-4 flex flex-col gap-1">
          {VARIANTS.map((v) => (
            <li key={v}>
              <Link to={`/dev/result/${v}`} className="text-cobalt underline">
                {v}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    );
  }
  return <ResultPage scan={scan} />;
}

export { VARIANTS };
