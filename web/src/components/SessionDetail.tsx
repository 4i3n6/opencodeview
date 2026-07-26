import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { useSession, useSessionTranscript, type TranscriptMessage } from "@/lib/api";
import { KpiCard } from "@/components/KpiCard";
import { PanelStatus } from "@/components/PanelStatus";
import { FlagBadge } from "@/components/FlagBadge";
import { MessageCard } from "@/components/transcript/MessageCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/context";
import { parseFlags } from "@/lib/flags";
import { fmtHours, fmtInt, fmtM, fmtPct } from "@/lib/utils";

const LIMIT = 40;

export function SessionDetail({
  id,
  onBack,
  onOpenSession,
}: {
  id: string;
  onBack: () => void;
  onOpenSession: (id: string) => void;
}) {
  const { t } = useI18n();
  const { data: session, isLoading: sessionLoading, isError: sessionError } = useSession(id);
  const [offset, setOffset] = useState(0);
  const [messages, setMessages] = useState<TranscriptMessage[]>([]);
  const seenOffsets = useRef<Set<number>>(new Set());
  const { data: page, isFetching, isError: transcriptError } = useSessionTranscript(id, offset, LIMIT);

  useEffect(() => {
    seenOffsets.current = new Set();
    setMessages([]);
    setOffset(0);
  }, [id]);

  useEffect(() => {
    if (!page) return;
    if (seenOffsets.current.has(page.offset)) return;
    seenOffsets.current.add(page.offset);
    setMessages((prev) => (page.offset === 0 ? page.messages : [...prev, ...page.messages]));
  }, [page]);

  if (sessionError) {
    return (
      <div className="flex flex-col gap-3">
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft size={16} aria-hidden="true" /> {t("common.back")}
        </Button>
        <div className="text-sm text-[var(--color-bad)]">{t("session.notFound")}</div>
      </div>
    );
  }

  const flags = parseFlags(session?.flags);
  const apTotal = (session?.apply_patch_ok ?? 0) + (session?.apply_patch_err ?? 0);
  const apPrec = apTotal > 0 ? (session?.apply_patch_ok ?? 0) / apTotal : null;
  const errRate = session && session.tool_calls > 0 ? session.tool_errors / session.tool_calls : 0;
  const totalTokens = session ? session.tokens_input + session.tokens_output + session.tokens_reasoning : 0;
  const total = messages.length;
  const hasMore = page ? total < page.total_messages : false;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft size={16} aria-hidden="true" /> {t("common.back")}
        </Button>
        <h2 className="min-w-0 flex-1 truncate text-lg font-semibold" title={session?.title ?? id}>
          {session?.title || id}
        </h2>
        {session?.slug ? <span className="shrink-0 text-xs text-[var(--color-muted)]">{session.slug}</span> : null}
        {session?.is_subagent ? (
          <Button variant="outline" onClick={() => session.parent_id && onOpenSession(session.parent_id)} disabled={!session.parent_id}>
            <ArrowUpRight size={14} aria-hidden="true" /> {t("session.openParent")}
          </Button>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <Badge tone={session?.is_subagent ? "purple" : "accent"}>{session?.is_subagent ? t("common.sub") : t("common.main")}</Badge>
        {session?.agent ? <Badge tone="neutral">agent:{session.agent}</Badge> : null}
        {session?.dominant_model_id ? (
          <Badge tone="neutral">
            {session.dominant_model_id}
            {session.dominant_variant ? `·${session.dominant_variant}` : ""}
          </Badge>
        ) : null}
        {session?.spawn_depth != null ? <Badge tone="neutral">{t("session.depth", { depth: session.spawn_depth })}</Badge> : null}
        {flags.map((f) => (
          <FlagBadge key={f} flag={f} />
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard title={t("common.tokens")} value={session ? fmtM(totalTokens) : "—"} />
        <KpiCard title={t("common.activeTime")} value={session ? fmtHours(session.active_min) : "—"} />
        <KpiCard
          title={t("common.toolCalls")}
          value={session ? fmtInt(session.tool_calls) : "—"}
          sub={session ? t("session.errorSub", { rate: fmtPct(errRate) }) : undefined}
          tone={errRate > 0.05 ? "warn" : "good"}
        />
        <KpiCard
          title={t("common.patchPrecision")}
          value={apPrec != null ? fmtPct(apPrec) : "—"}
          sub={apTotal > 0 ? `${fmtInt(session?.apply_patch_ok ?? 0)}/${fmtInt(apTotal)}` : t("project.noApplyPatch")}
        />
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{t("session.transcript")}</span>
          <span className="text-xs text-[var(--color-muted)]">
            {page ? t("session.messageCount", { loaded: total, total: page.total_messages }) : sessionLoading ? t("session.messagesLoading") : ""}
          </span>
        </div>
        <div className="flex flex-col gap-2">
          {transcriptError ? <PanelStatus kind="error" minHeightClassName="min-h-24" /> : messages.map((m) => <MessageCard key={m.id} message={m} />)}
        </div>
        {hasMore ? (
          <Button variant="outline" onClick={() => setOffset((o) => o + LIMIT)} disabled={isFetching}>
            {isFetching ? t("session.loadingMore") : t("session.loadMore")}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
