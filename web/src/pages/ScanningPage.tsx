import { useParams } from "react-router-dom";

// Placeholder — step 4 wires useScan(scanId) polling and the full
// scanning → result transition. For now the route just renders so
// HomePage's navigate(`/scan/:id`) call has somewhere to land.
export function ScanningPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <div className="mx-auto max-w-2xl px-4 py-8 md:px-8 md:py-12">
      <h1 className="text-2xl font-semibold">Analyzing image…</h1>
      <p className="mt-2 text-sm text-ink-muted">
        Polling hook lands in step 4. Scan ID: <code>{id}</code>
      </p>
    </div>
  );
}
