import { useId, useState } from "react";
import { ChevronDown, ChevronRight, Info, Wrench } from "lucide-react";
import type { LiveHealth, LiveNode } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/i18n/context";
import { fmtElapsedS, fmtInt, fmtM, parseModel } from "@/lib/utils";
import { HEALTH_BADGE_TONE, RESOLVED_HEALTHS } from "./constants";

const HEALTH_BG_CLASS: Record<LiveHealth, string> = {
  green: "bg-[var(--color-good)]",
  yellow: "bg-[var(--color-warn)]",
  red: "bg-[var(--color-bad)]",
  idle: "bg-[var(--color-muted)]",
  done: "bg-[var(--color-muted)]",
};

function fmtAgo(ms: number | null | undefined, now: number): string {
  if (ms == null) return "—";
  const seconds = Math.max(0, Math.floor((now - ms) / 1000));
  return fmtElapsedS(seconds);
}

function fmtSince(ms: number, now: number): string {
  const seconds = Math.max(0, Math.floor((now - ms) / 1000));
  return fmtElapsedS(seconds);
}

function terminalEventLabel(event: string | null, t: ReturnType<typeof useI18n>["t"]): string | null {
  if (!event) return null;
  if (event === "poll_timeout") return t("terminal.poll_timeout");
  if (event === "max_turns") return t("terminal.max_turns");
  if (event === "aborted_by_user") return t("terminal.aborted_by_user");
  if (event === "terminal_error") return t("terminal.terminal_error");
  if (event.startsWith("aborted:")) return t("terminal.abortedPrefix", { reason: event.slice("aborted:".length) });
  return event;
}

function HealthDot({ health, justProgressed }: { readonly health: LiveHealth; readonly justProgressed: boolean }) {
  return (
    <span className="relative flex size-2.5 shrink-0 items-center justify-center">
      {health === "green" ? <span className={`absolute inline-flex h-full w-full animate-pulse rounded-full ${HEALTH_BG_CLASS.green} opacity-40`} /> : null}
      {justProgressed ? <span className="absolute inline-flex h-[160%] w-[160%] animate-ping rounded-full bg-[var(--color-accent)] opacity-70" /> : null}
      <span className={`relative inline-flex size-2.5 rounded-full ${HEALTH_BG_CLASS[health]}`} />
    </span>
  );
}

type NodeRowProps = {
  readonly node: LiveNode;
  readonly depth: number;
  readonly childrenByParent: Map<string, LiveNode[]>;
  readonly now: number;
  readonly justProgressedIds: Set<string>;
  readonly onOpenSession?: ((id: string) => void) | undefined;
  readonly attentionHint?: "waiting" | "isolated" | undefined;
};

export function LiveNodeRow({ node, depth, childrenByParent, now, justProgressedIds, onOpenSession, attentionHint }: NodeRowProps) {
  const { t } = useI18n();
  const rowScrollHintId = useId();
  const [open, setOpen] = useState(true);
  const [showDetail, setShowDetail] = useState(false);
  const [showResolved, setShowResolved] = useState(false);
  const kids = childrenByParent.get(node.session_id) ?? [];
  const activeKids = kids.filter((kid) => !RESOLVED_HEALTHS.has(kid.health));
  const resolvedKids = kids.filter((kid) => RESOLVED_HEALTHS.has(kid.health));
  const hasKids = kids.length > 0;
  const model = parseModel(node.model);
  const badTerminal = terminalEventLabel(node.terminal_event, t);
  const errRate = node.tool_calls > 0 ? node.tool_errors / node.tool_calls : 0;
  const hasDetail = Boolean(node.last_tool_title || node.last_tool_name || node.last_text_snippet);
  const justProgressed = justProgressedIds.has(node.session_id);
  const rowPadding = depth * 18 + 6;

  return (
    <div>
      <div className="w-full min-w-0 overflow-x-auto" tabIndex={0} aria-label={t("live.rowScrollLabel", { title: node.title || node.session_id })} aria-describedby={rowScrollHintId}>
        <span id={rowScrollHintId} className="sr-only">{t("common.horizontalScrollHint")}</span>
        <div className="flex min-w-max flex-nowrap items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-[var(--color-panel-2)]/50" style={{ paddingLeft: rowPadding }}>
          <button type="button" className="flex size-4 items-center justify-center text-[var(--color-muted)] disabled:opacity-0" disabled={!hasKids} aria-label={open ? t("live.collapseNode") : t("live.expandNode")} aria-expanded={hasKids ? open : undefined} onClick={() => setOpen((value) => !value)}>
            {hasKids ? open ? <ChevronDown size={14} /> : <ChevronRight size={14} /> : null}
          </button>
          <HealthDot health={node.health} justProgressed={justProgressed} />
          {onOpenSession ? (
            <button type="button" className="min-w-0 max-w-[260px] flex-1 truncate rounded text-left font-medium underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]" title={node.title ?? node.session_id} onClick={() => onOpenSession(node.session_id)}>
              {node.title || node.session_id}
            </button>
          ) : (
            <span className="min-w-0 max-w-[260px] flex-1 truncate font-medium" title={node.title ?? node.session_id}>{node.title || node.session_id}</span>
          )}
          <span className="flex shrink-0 items-center gap-1 rounded-md border border-[var(--color-border)] bg-[var(--color-panel-2)] px-1.5 py-0.5 text-[10px] text-[var(--color-accent)]">{node.project_slug}</span>
          <span className="shrink-0 rounded-md border border-[var(--color-border)] bg-[var(--color-panel-2)] px-1.5 py-0.5 text-[10px] text-[var(--color-muted)]">{node.agent ?? t("common.main")}</span>
          <span className="shrink-0 text-[10px] text-[var(--color-muted)]">{model?.id ?? "—"}</span>
          {hasDetail ? (
            <button type="button" className={`flex shrink-0 items-center justify-center rounded-md border p-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)] ${showDetail ? "border-[var(--color-accent)] text-[var(--color-accent)]" : "border-[var(--color-border)] text-[var(--color-muted)]"}`} title={t("live.currentDetail")} aria-label={showDetail ? t("live.hideCurrentDetail") : t("live.showCurrentDetail")} aria-expanded={showDetail} onClick={() => setShowDetail((value) => !value)}>
              <Info size={12} />
            </button>
          ) : null}
          <div className="flex-1" />
          {justProgressed ? <span className="shrink-0 text-[10px] font-medium text-[var(--color-accent)]" title={t("live.realChange")}>● {t("live.new")}</span> : null}
          <Badge tone={HEALTH_BADGE_TONE[node.health]}>{t(`live.health.${node.health}`)}</Badge>
          {attentionHint === "waiting" ? <Badge tone="neutral" title={t("live.waitingChildTitle")}>{t("live.waitingChild")}</Badge> : null}
          {attentionHint === "isolated" ? <Badge tone="bad" title={t("live.noChildActivityTitle")}>{t("live.noChildActivity")}</Badge> : null}
          {badTerminal ? <Badge tone="bad">{badTerminal}</Badge> : null}
          {node.tool_calls > 0 ? <span className={`shrink-0 text-[11px] tabular-nums ${errRate > 0.3 ? "text-[var(--color-bad)]" : "text-[var(--color-muted)]"}`} title={t("live.toolCallsErrors")}>{fmtInt(node.tool_calls)} {t("common.calls")}{node.tool_errors > 0 ? ` (${fmtInt(node.tool_errors)} ${t("common.err")})` : ""}</span> : null}
          <span className="shrink-0 text-xs tabular-nums text-[var(--color-accent)]">{fmtM(node.tokens)}</span>
          <span className="shrink-0 w-16 text-right text-xs tabular-nums text-[var(--color-purple)]" title={t("live.createdElapsed")}>{fmtSince(node.time_created, now)}</span>
          <span className="shrink-0 w-20 text-right text-xs tabular-nums" title={t("live.lastActivity")}>{t("live.inactiveShort", { time: fmtAgo(node.last_real_activity_at, now) })}</span>
        </div>
      </div>
      {showDetail ? <NodeDetail node={node} depth={depth} now={now} describedBy={rowScrollHintId} /> : null}
      {open ? <NodeChildren activeKids={activeKids} resolvedKids={resolvedKids} depth={depth} childrenByParent={childrenByParent} now={now} justProgressedIds={justProgressedIds} onOpenSession={onOpenSession} showResolved={showResolved} setShowResolved={setShowResolved} /> : null}
    </div>
  );
}

function NodeDetail({ node, depth, now, describedBy }: { readonly node: LiveNode; readonly depth: number; readonly now: number; readonly describedBy: string }) {
  const { t } = useI18n();
  return (
    <div className="mx-1.5 mb-1 overflow-x-auto rounded-md border border-[var(--color-border)] bg-[var(--color-panel-2)]/60 px-3 py-2 text-xs text-[var(--color-muted)]" style={{ marginLeft: depth * 18 + 22 }} tabIndex={0} aria-label={t("live.detailScrollLabel")} aria-describedby={describedBy}>
      {node.last_tool_title || node.last_tool_name ? <div className="mb-1 flex items-center gap-1.5 text-[var(--color-fg)]"><Wrench size={12} className="shrink-0 text-[var(--color-accent)]" /><span className="font-medium">{node.last_tool_title || node.last_tool_name}</span>{node.last_tool_name && node.last_tool_title ? <span className="text-[var(--color-muted)]">({node.last_tool_name})</span> : null}<span className="text-[var(--color-muted)]">· {t("live.toolOrTextAge", { time: fmtAgo(node.last_tool_at, now) })}</span></div> : null}
      {node.last_text_snippet ? <p className="whitespace-pre-wrap italic">"{node.last_text_snippet}"<span className="ml-1.5 not-italic text-[var(--color-muted)]">· {t("live.toolOrTextAge", { time: fmtAgo(node.last_text_at, now) })}</span></p> : null}
    </div>
  );
}

type NodeChildrenProps = {
  readonly activeKids: readonly LiveNode[];
  readonly resolvedKids: readonly LiveNode[];
  readonly depth: number;
  readonly childrenByParent: Map<string, LiveNode[]>;
  readonly now: number;
  readonly justProgressedIds: Set<string>;
  readonly onOpenSession?: ((id: string) => void) | undefined;
  readonly showResolved: boolean;
  readonly setShowResolved: (value: boolean) => void;
};

function NodeChildren({ activeKids, resolvedKids, depth, childrenByParent, now, justProgressedIds, onOpenSession, showResolved, setShowResolved }: NodeChildrenProps) {
  const { t } = useI18n();
  return (
    <div>
      {activeKids.map((node) => <LiveNodeRow key={node.session_id} node={node} depth={depth + 1} childrenByParent={childrenByParent} now={now} justProgressedIds={justProgressedIds} onOpenSession={onOpenSession} />)}
      {resolvedKids.length > 0 ? (
        showResolved ? (
          <>
            {resolvedKids.map((node) => <LiveNodeRow key={node.session_id} node={node} depth={depth + 1} childrenByParent={childrenByParent} now={now} justProgressedIds={justProgressedIds} onOpenSession={onOpenSession} />)}
            <button type="button" className="my-0.5 flex items-center gap-1 rounded-md border border-[var(--color-border)] bg-[var(--color-panel-2)] px-2 py-0.5 text-xs text-[var(--color-muted)] hover:border-[var(--color-accent)] hover:text-[var(--color-fg)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]" style={{ marginLeft: (depth + 1) * 18 + 22 }} aria-expanded={showResolved} onClick={() => setShowResolved(false)}>
              <ChevronDown size={12} /> {t("live.hideResolved", { count: fmtInt(resolvedKids.length) })}
            </button>
          </>
        ) : (
          <button type="button" className="my-0.5 flex items-center gap-1 rounded-md border border-[var(--color-border)] bg-[var(--color-panel-2)] px-2 py-0.5 text-xs text-[var(--color-muted)] hover:border-[var(--color-accent)] hover:text-[var(--color-fg)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]" style={{ marginLeft: (depth + 1) * 18 + 22 }} aria-expanded={showResolved} onClick={() => setShowResolved(true)}>
            <ChevronRight size={12} /> {t("live.showResolved", { count: fmtInt(resolvedKids.length) })}
          </button>
        )
      ) : null}
    </div>
  );
}
