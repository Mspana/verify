import { Clock } from "lucide-react";

type Props = {
  title: string;
  body?: string;
};

export function EmptyState({ title, body }: Props) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-card border border-dashed border-border bg-paper px-6 py-10 text-center">
      <Clock className="h-6 w-6 text-ink/55" aria-hidden />
      <div className="text-sm font-medium">{title}</div>
      {body && <div className="text-xs text-ink/55">{body}</div>}
    </div>
  );
}
