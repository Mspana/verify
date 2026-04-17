import { Route, Routes } from "react-router-dom";

import { AppShell } from "./components/layout/AppShell";
import { AccountPage } from "./pages/AccountPage";
import { HistoryPage } from "./pages/HistoryPage";
import { HomePage } from "./pages/HomePage";
import { ScanningPage } from "./pages/ScanningPage";
import { DevPreviewPage } from "./pages/DevPreviewPage";
import { DevScanningPage } from "./pages/DevScanningPage";

// Dev-only routes are mounted behind `import.meta.env.DEV` so they
// don't ship to production. They exist purely for visual review of
// each variant without needing real scan data in the Worker's KV.
// See web/src/pages/DevPreviewPage.tsx for the fixture payloads.
const DEV_ROUTES = import.meta.env.DEV ? (
  <>
    <Route path="/dev/result/:variant" element={<DevPreviewPage />} />
    <Route path="/dev/scanning" element={<DevScanningPage />} />
  </>
) : null;

export default function App() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/scan/:id" element={<ScanningPage />} />
        <Route path="/history" element={<HistoryPage />} />
        <Route path="/account" element={<AccountPage />} />
        {DEV_ROUTES}
      </Routes>
    </AppShell>
  );
}
