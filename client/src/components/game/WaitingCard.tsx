import { useI18n } from "../../i18n";

export function WaitingCard({ message }: { message: string }): JSX.Element {
  const { t } = useI18n();
  return (
    <div className="waiting-card-inline">
      <h2>{t("common.sent")}</h2>
      <p>{message}</p>
    </div>
  );
}
