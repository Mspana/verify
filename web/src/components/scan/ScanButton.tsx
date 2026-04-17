import { Loader2, ScanLine } from "lucide-react";

import { Button } from "../ui/Button";

// The primary bilingual CTA. Width is full on mobile and content-width
// on desktop so the upload area and button form a stacked pair on narrow
// screens and a side-by-side pair on wide ones.

type Props = {
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
};

export function ScanButton({ onClick, disabled, loading }: Props) {
  return (
    <Button
      size="lg"
      onClick={onClick}
      disabled={disabled || loading}
      className="w-full md:w-auto"
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
      ) : (
        <ScanLine className="h-4 w-4" aria-hidden />
      )}
      <span>
        <span className="font-medium">扫描</span>
        <span className="mx-1.5 opacity-70">·</span>
        <span>Scan</span>
      </span>
    </Button>
  );
}
