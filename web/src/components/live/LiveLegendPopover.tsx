import { useEffect, useRef, useState } from "react";
import { CircleHelp, Info, X } from "lucide-react";
import { useI18n } from "@/i18n/context";

export function LiveLegendPopover() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open]);
  return (
    <div className="relative">
      <button
        type="button"
        ref={triggerRef}
        className="flex items-center justify-center rounded-md border border-[var(--color-border)] p-1 text-[var(--color-muted)] hover:text-[var(--color-fg)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
        title={t("live.legend")}
        aria-label={open ? t("live.closeLegend") : t("live.openLegend")}
        aria-expanded={open}
        aria-controls="live-legend-popover"
        onClick={() => setOpen((value) => !value)}
      >
        <CircleHelp size={14} aria-hidden="true" />
      </button>
      {open ? (
        <div id="live-legend-popover" role="dialog" aria-label={t("live.legend")} className="absolute right-0 top-8 z-10 w-80 max-w-[calc(100vw-2rem)] rounded-md border border-[var(--color-border)] bg-[var(--color-panel)] p-3 text-xs text-[var(--color-muted)] shadow-lg">
          <div className="mb-2 flex items-center justify-between">
            <span className="font-medium text-[var(--color-fg)]">{t("live.howToRead")}</span>
            <button type="button" aria-label={t("live.closeLegend")} onClick={() => { setOpen(false); triggerRef.current?.focus(); }} className="rounded text-[var(--color-muted)] hover:text-[var(--color-fg)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]">
              <X size={12} aria-hidden="true" />
            </button>
          </div>
          <p className="mb-1.5">{t("live.legendPulseHtml")}</p>
          <p className="mb-1.5">
            <Info size={11} className="inline" /> {t("live.legendToolHtml")}
          </p>
          <p className="mb-1.5">{t("live.legendSuspectHtml")}</p>
          <p>{t("live.legendClosedHtml")}</p>
        </div>
      ) : null}
    </div>
  );
}
