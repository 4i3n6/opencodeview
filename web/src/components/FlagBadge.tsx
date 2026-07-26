import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/i18n/context";
import { flagMeta } from "@/lib/flags";

export function FlagBadge({ flag, count }: { flag: string; count?: number }) {
  const { t } = useI18n();
  const meta = flagMeta(flag);
  const label = "labelKey" in meta ? t(meta.labelKey) : meta.label;
  const description = "descriptionKey" in meta ? t(meta.descriptionKey) : meta.description;
  return (
    <Badge tone={meta.tone} title={description}>
      {label}
      {count != null ? <span className="opacity-70">· {count}</span> : null}
    </Badge>
  );
}
