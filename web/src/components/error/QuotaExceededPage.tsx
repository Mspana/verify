import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { QuotaResponse } from "@verify/shared";

import { ACTION_LABEL } from "../../lib/errors";
import { formatResetsIn } from "../../lib/quota";
import { ErrorPage } from "./ErrorPage";

// Amber full-page variant of ErrorPage for QUOTA_EXCEEDED. Not a
// failure — a product limit — so the palette reads as "be patient"
// rather than "broken."

type Props = {
  quota: QuotaResponse;
};

export function QuotaExceededPage({ quota }: Props) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const countdown = formatResetsIn(quota.resetsAt, now);

  return (
    <ErrorPage
      variant="amber"
      title={t("quota.title")}
      body={<>{t("quota.usedAll", { limit: quota.limit })}</>}
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
