import { useTranslation } from "react-i18next";

export function AccountPage() {
  const { t } = useTranslation();
  return (
    <div className="mx-auto max-w-2xl px-4 py-8 md:px-8 md:py-12">
      <h1 className="text-2xl font-semibold">{t("account.title")}</h1>
      <p className="mt-2 text-sm text-ink/55">{t("account.comingSoon")}</p>
    </div>
  );
}
