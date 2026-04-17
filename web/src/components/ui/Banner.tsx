import { AlertTriangle, Info } from "lucide-react";
import type { ReactNode } from "react";

// Small inline notice. Uses uncertain-fill for warnings/errors (amber)
// and paper-alt for neutral info, both muted so they read as a status
// rather than an alert. Full-page error rendering lives elsewhere.

type Props = {
  kind?: "error" | "info";
  headline?: string;
  children: ReactNode;
};

export function Banner({ kind = "info", headline, children }: Props) {
  const isError = kind === "error";
  const cls = isError
    ? "bg-uncertain-fill text-uncertain-ink border-uncertain-accent/30"
    : "bg-paper-alt text-ink border-ink/10";
  const Icon = isError ? AlertTriangle : Info;
  return (
    <div
      role={isError ? "alert" : "status"}
      className={`flex items-start gap-3 rounded-card border p-3 text-sm ${cls}`}
    >
      <Icon className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden />
      <div className="flex-1">
        {headline && <div className="font-medium">{headline}</div>}
        <div className={headline ? "mt-0.5 opacity-90" : ""}>{children}</div>
      </div>
    </div>
  );
}
