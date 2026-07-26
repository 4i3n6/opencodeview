import type { ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoBadge, type InfoKind } from "@/components/InfoBadge";

export function KpiCard({
  title,
  value,
  sub,
  tone = "fg",
  badge,
}: {
  title: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: "fg" | "good" | "warn" | "bad" | "accent";
  badge?: InfoKind;
}) {
  const color =
    tone === "good"
      ? "text-[var(--color-good)]"
      : tone === "warn"
        ? "text-[var(--color-warn)]"
        : tone === "bad"
          ? "text-[var(--color-bad)]"
          : tone === "accent"
            ? "text-[var(--color-accent)]"
            : "text-[var(--color-fg)]";
  return (
    <Card>
      <CardHeader className="flex items-center justify-between gap-2">
        <CardTitle>{title}</CardTitle>
        {badge ? <InfoBadge kind={badge} /> : null}
      </CardHeader>
      <CardContent>
        <div className={`text-2xl font-semibold tabular-nums ${color}`}>{value}</div>
        {sub ? <div className="mt-1 text-xs text-[var(--color-muted)]">{sub}</div> : null}
      </CardContent>
    </Card>
  );
}
