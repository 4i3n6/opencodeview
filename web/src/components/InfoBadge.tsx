import { Badge } from "@/components/ui/badge";
import type { BadgeProps } from "@/components/ui/badge";
import { useI18n } from "@/i18n/context";
import { INFO_KIND_LABEL_KEYS } from "@/i18n/mappings";

export type InfoKind = "fact" | "efficiency" | "quality" | "waste" | "leverage";

const KIND_META: Record<InfoKind, { tone: NonNullable<BadgeProps["tone"]> }> = {
  fact: { tone: "neutral" },
  efficiency: { tone: "accent" },
  quality: { tone: "good" },
  waste: { tone: "bad" },
  leverage: { tone: "purple" },
};

export function InfoBadge({ kind }: { kind: InfoKind }) {
  const { t } = useI18n();
  const meta = KIND_META[kind];
  return <Badge tone={meta.tone}>{t(INFO_KIND_LABEL_KEYS[kind])}</Badge>;
}
