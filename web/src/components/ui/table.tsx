import { useEffect, useId, useRef, useState, type HTMLAttributes, type ReactNode, type TdHTMLAttributes, type ThHTMLAttributes } from "react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n/context";

export function TableScrollContainer({
  children,
  className,
  label,
  hint,
}: {
  readonly children: ReactNode;
  readonly className?: string;
  readonly label?: string;
  readonly hint: string;
}) {
  const { t } = useI18n();
  const accessibleLabel = label ?? t("common.tableLabel");
  const hintId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const [overflowsX, setOverflowsX] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const update = () => {
      setOverflowsX(el.scrollWidth > el.clientWidth + 1);
    };

    update();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    observer?.observe(el);
    for (const child of el.children) observer?.observe(child);
    window.addEventListener("resize", update);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [children]);

  return (
    <div
      ref={containerRef}
      className={cn("relative w-full overflow-auto rounded-lg border", className)}
      tabIndex={overflowsX ? 0 : undefined}
      aria-label={overflowsX ? accessibleLabel : undefined}
      aria-describedby={overflowsX ? hintId : undefined}
    >
      {overflowsX ? (
        <div id={hintId} className="sticky left-0 top-0 z-10 bg-[var(--color-panel-2)] px-3 py-1 text-[10px] text-[var(--color-muted)]">
          {hint}
        </div>
      ) : null}
      {children}
    </div>
  );
}

export function Table({ className, label, ...props }: HTMLAttributes<HTMLTableElement> & { readonly label?: string }) {
  const { t } = useI18n();
  return (
    <TableScrollContainer label={label ?? t("common.tableLabel")} hint={t("common.tableScrollHint")}>
      <table className={cn("w-full border-collapse text-sm", className)} {...props} />
    </TableScrollContainer>
  );
}

export function THead({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead
      className={cn("bg-[var(--color-panel-2)] text-[var(--color-muted)]", className)}
      {...props}
    />
  );
}

export function TR({ className, ...props }: HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cn("border-b hover:bg-[var(--color-panel-2)]/50", className)} {...props} />;
}

export function TH({ className, ...props }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn("text-left font-medium px-3 py-2 whitespace-nowrap", className)}
      {...props}
    />
  );
}

export function TD({ className, ...props }: TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn("px-3 py-2 whitespace-nowrap align-middle", className)} {...props} />;
}
