import { useI18n } from "@/i18n/context";
import { cn } from "@/lib/utils";

export function PanelStatus({
  kind = "loading",
  className,
  minHeightClassName = "min-h-[220px]",
}: {
  readonly kind?: "loading" | "empty" | "error";
  readonly className?: string;
  readonly minHeightClassName?: string;
}) {
  const { t } = useI18n();
  const label = kind === "loading" ? t("common.loading") : kind === "empty" ? t("common.emptyScope") : t("common.loadError");
  const isError = kind === "error";

  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-lg border border-dashed border-[var(--color-border)] bg-[var(--color-panel-2)]/40 px-4 py-6 text-sm",
        isError ? "text-[var(--color-bad)]" : "text-[var(--color-muted)]",
        minHeightClassName,
        className,
      )}
      role={isError ? "alert" : "status"}
      aria-live={isError ? "assertive" : "polite"}
    >
      {label}
    </div>
  );
}
