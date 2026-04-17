import type { ButtonHTMLAttributes, ReactNode } from "react";

// Three variants. Primary for the main CTA (cobalt); secondary for
// neutral actions (ink outline on paper); ghost for text-only actions
// inside dense layouts.

type Variant = "primary" | "secondary" | "ghost";
type Size = "md" | "lg";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  children: ReactNode;
};

const BASE =
  "inline-flex items-center justify-center gap-2 rounded-btn font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-cobalt text-paper hover:bg-cobalt/90",
  secondary:
    "bg-paper text-ink border border-ink/20 hover:bg-paper-edge",
  ghost: "bg-transparent text-ink hover:bg-paper-edge",
};

const SIZES: Record<Size, string> = {
  md: "h-10 px-4 text-sm",
  lg: "h-14 px-6 text-base",
};

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  children,
  ...rest
}: Props) {
  return (
    <button
      className={[BASE, VARIANTS[variant], SIZES[size], className].join(" ")}
      {...rest}
    >
      {children}
    </button>
  );
}
