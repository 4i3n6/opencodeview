import type { TranscriptMessage } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { MessagePartView } from "@/components/transcript/MessagePart";
import { useI18n } from "@/i18n/context";
import { fmtDurationMs, fmtM } from "@/lib/utils";
function roleTone(role: string): "accent" | "purple" | "neutral" {
  if (role === "user") return "accent";
  if (role === "assistant") return "purple";
  return "neutral";
}

export function MessageCard({ message }: { message: TranscriptMessage }) {
  const { t } = useI18n();
  const latency =
    message.time_completed != null ? fmtDurationMs(message.time_completed - message.time_created) : "—";
  const total = message.tokens?.total;

  return (
    <div className="flex flex-col gap-2 rounded-lg border bg-[var(--color-panel)] p-3">
      <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--color-muted)]">
        <Badge tone={roleTone(message.role)}>{message.role}</Badge>
        {message.model_id ? (
          <span>
            {message.model_id}
            {message.variant ? <span className="opacity-60"> ·{message.variant}</span> : null}
          </span>
        ) : null}
        {message.agent ? <span className="opacity-70">{t("transcript.agentPrefix", { agent: message.agent })}</span> : null}
        <div className="flex-1" />
        {total != null ? <span className="tabular-nums text-[var(--color-accent)]">{fmtM(total)} {t("transcript.tokenSuffix")}</span> : null}
        <span className="tabular-nums">{latency}</span>
        {message.finish && message.finish !== "stop" ? <Badge tone="warn">{message.finish}</Badge> : null}
      </div>
      <div className="flex flex-col gap-2">
        {message.parts.map((part, i) => (
          <MessagePartView key={i} part={part} />
        ))}
      </div>
    </div>
  );
}
