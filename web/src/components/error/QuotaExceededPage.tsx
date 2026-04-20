import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { QuotaResponse } from "@verify/shared";

import { ACTION_LABEL } from "../../lib/errors";
import { formatResetsIn } from "../../lib/quota";
import { ErrorPage } from "./ErrorPage";

// Amber full-page variant of ErrorPage for QUOTA_EXCEEDED. Not a
// failure — a product limit — so the palette reads as "be patient"
// rather than "broken."
//
// Countdown ticks once per minute. When it hits the "shortly" floor
// we stop ticking rather than auto-refresh: the server's midnight
// Beijing reset may be ±seconds off the client clock, and an
// auto-refresh would be a subtle race. Users can retry manually.

type Props = {
  quota: QuotaResponse;
};

export function QuotaExceededPage({ quota }: Props) {
  const navigate = useNavigate();
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const countdown = formatResetsIn(quota.resetsAt, now);

  return (
    <ErrorPage
      variant="amber"
      title="Daily scan limit reached"
      body={
        <>
          You've used all {quota.limit} scans for today.
        </>
      }
      extra={
        <p className="text-[12px] font-medium text-uncertain-ink">
          {countdown}
        </p>
      }
      secondary={{
        label: ACTION_LABEL["see-history"],
        onClick: () => navigate("/history"),
      }}
      code="QUOTA_EXCEEDED"
    />
  );
}
