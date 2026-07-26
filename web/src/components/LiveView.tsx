import { useEffect, useMemo, useRef, useState } from "react";
import { CircleCheck, ShieldAlert, X } from "lucide-react";
import { LIVE_REFRESH_INTERVAL_MS, useLive, type LiveHealth, type LiveNode } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PanelStatus } from "@/components/PanelStatus";
import { useI18n } from "@/i18n/context";
import { fmtElapsedS, fmtInt } from "@/lib/utils";
import { HEALTH_BADGE_TONE, RESOLVED_HEALTHS } from "./live/constants";
import { LiveNodeRow } from "./live/LiveNodeRow";
import { LiveLegendPopover } from "./live/LiveLegendPopover";

type ProgressSnapshot = { tool_calls: number; tokens: number; time_updated: number };

const HEALTH_SEVERITY: Record<LiveHealth, number> = { red: 0, yellow: 1, green: 2, idle: 3, done: 4 };


export function LiveView({ onOpenSession }: { onOpenSession?: (id: string) => void }) {
  const { t } = useI18n();
  const [sinceMin, setSinceMin] = useState(180);
  const [healthFilter, setHealthFilter] = useState<LiveHealth | null>(null);
  const { data, isFetching, isError } = useLive(sinceMin);
  const now = data?.generated_at ?? Date.now();

  // Diffs this poll's numbers against the previous poll's numbers, per
  // session. A session only lands in `justProgressed` when something it
  // reports (tool calls, tokens, or the DB's own time_updated) actually
  // changed since the last fetch -- this is observed movement, not
  // a guess derived from the health label.
  const prevSnapshotRef = useRef<Map<string, ProgressSnapshot> | null>(null);
  const [justProgressed, setJustProgressed] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!data) return;
    const prev = prevSnapshotRef.current;
    const next = new Map<string, ProgressSnapshot>();
    const progressed = new Set<string>();
    for (const n of data.nodes) {
      const snapshot: ProgressSnapshot = { tool_calls: n.tool_calls, tokens: n.tokens, time_updated: n.time_updated };
      next.set(n.session_id, snapshot);
      if (prev) {
        const p = prev.get(n.session_id);
        if (p && (p.tool_calls !== snapshot.tool_calls || p.tokens !== snapshot.tokens || p.time_updated !== snapshot.time_updated)) {
          progressed.add(n.session_id);
        }
      }
    }
    prevSnapshotRef.current = next;
    setJustProgressed(progressed);
  }, [data]);

  const { roots, childrenByParent, counts, attention, filteredFlat, hasActiveDescendant } = useMemo(() => {
    const nodes = data?.nodes ?? [];
    const byId = new Map(nodes.map((n) => [n.session_id, n]));
    const childrenByParent = new Map<string, LiveNode[]>();
    const roots: LiveNode[] = [];
    for (const n of nodes) {
      if (n.parent_id && byId.has(n.parent_id)) {
        const arr = childrenByParent.get(n.parent_id) ?? [];
        arr.push(n);
        childrenByParent.set(n.parent_id, arr);
      } else {
        roots.push(n);
      }
    }
    for (const arr of childrenByParent.values()) arr.sort((a, b) => b.time_updated - a.time_updated);
    roots.sort((a, b) => b.time_updated - a.time_updated);
    const counts: Record<LiveHealth, number> = { green: 0, yellow: 0, red: 0, idle: 0, done: 0 };
    for (const n of nodes) counts[n.health]++;
    const attention = nodes
      .filter((n) => n.health === "red" || n.health === "yellow")
      .sort((a, b) => HEALTH_SEVERITY[a.health] - HEALTH_SEVERITY[b.health] || b.time_updated - a.time_updated);
    const filteredFlat = nodes.filter((n) => n.health === healthFilter).sort((a, b) => b.time_updated - a.time_updated);
    // Does this node have an active (non-done/idle) descendant anywhere
    // below it, at any depth? This is what tells the attention panel
    // whether a yellow/red parent is quiet because it's genuinely stuck,
    // or because it is synchronously blocked in task() while real work
    // happens further down the tree (the exact pattern a busy delegate
    // chain produces).
    const hasActiveDescendant = new Set<string>();
    const memo = new Map<string, boolean>();
    function computeHasActive(id: string): boolean {
      const cached = memo.get(id);
      if (cached !== undefined) return cached;
      memo.set(id, false); // guard against cycles
      let has = false;
      for (const k of childrenByParent.get(id) ?? []) {
        if (!RESOLVED_HEALTHS.has(k.health) || computeHasActive(k.session_id)) has = true;
      }
      memo.set(id, has);
      if (has) hasActiveDescendant.add(id);
      return has;
    }
    for (const n of nodes) computeHasActive(n.session_id);
    return { roots, childrenByParent, counts, attention, filteredFlat, hasActiveDescendant };
  }, [data, healthFilter]);

  const emptyChildren = useMemo(() => new Map<string, LiveNode[]>(), []);

  // Same parent->children edges as the main tree, but pruned to only the
  // still-open descendants (not done/idle). This is what lets the
  // attention panel answer "why is this quiet" inline -- e.g. a parent
  // that is only yellow because it is synchronously waiting on a task()
  // call shows that active child right below it, instead of forcing a
  // hunt through the full tree below.
  const activeChildrenByParent = useMemo(() => {
    const map = new Map<string, LiveNode[]>();
    for (const [parentId, kids] of childrenByParent) {
      const activeKids = kids.filter((k) => !RESOLVED_HEALTHS.has(k.health));
      if (activeKids.length > 0) map.set(parentId, activeKids);
    }
    return map;
  }, [childrenByParent]);

  function HealthBadge({ health, label }: { health: LiveHealth; label: string }) {
    const active = healthFilter === health;
    return (
      <button
        type="button"
        onClick={() => setHealthFilter((h) => (h === health ? null : health))}
        className={active ? "ring-2 ring-[var(--color-accent)] rounded-md" : ""}
        title={t("live.filterBy", { label: label.toLowerCase() })}
        aria-pressed={active}
      >
        <Badge tone={HEALTH_BADGE_TONE[health]}>
          {label}: {counts[health]}
        </Badge>
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm text-[var(--color-muted)]" htmlFor="live-window">
          {t("live.window")}
        </label>
        <select
          id="live-window"
          className="h-8 rounded-md border bg-[var(--color-panel)] px-2 text-sm text-[var(--color-fg)]"
          value={sinceMin}
          onChange={(e) => setSinceMin(Number(e.target.value))}
        >
          <option value={30}>{t("live.last30m")}</option>
          <option value={60}>{t("live.last1h")}</option>
          <option value={180}>{t("live.last3h")}</option>
          <option value={360}>{t("live.last6h")}</option>
          <option value={720}>{t("live.last12h")}</option>
        </select>
        <span className="text-xs text-[var(--color-muted)]">{isFetching ? t("common.refreshing") : t("common.updated")} · {t("common.autoRefresh", { interval: fmtElapsedS(LIVE_REFRESH_INTERVAL_MS / 1000) })}</span>
        <div className="flex-1" />
        <div className="flex flex-wrap items-center gap-2">
          <HealthBadge health="green" label={t("live.active")} />
          {counts.yellow > 0 ? <HealthBadge health="yellow" label={t("live.slow")} /> : null}
          {counts.red > 0 ? <HealthBadge health="red" label={t("live.suspect")} /> : null}
          <HealthBadge health="idle" label={t("live.waiting")} />
          <HealthBadge health="done" label={t("live.done")} />
        </div>
      </div>

      {isError ? (
        <Card>
          <CardContent>
            <PanelStatus kind="error" minHeightClassName="min-h-24" />
          </CardContent>
        </Card>
      ) : (
        <>
          <Card className={attention.length > 0 ? "border-[color-mix(in_oklab,var(--color-bad)_35%,transparent)]" : undefined}>
        <CardHeader className={attention.length === 0 ? "flex flex-col gap-1 px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between" : undefined}>
          <CardTitle className="flex items-center gap-2 text-sm">
            {attention.length > 0 ? (
              <ShieldAlert size={16} className="text-[var(--color-bad)]" />
            ) : (
              <CircleCheck size={16} className="text-[var(--color-good)]" />
            )}
            <span className="whitespace-nowrap">{attention.length > 0 ? t("live.needsAttention", { count: fmtInt(attention.length) }) : t("live.allQuiet")}</span>
          </CardTitle>
          {attention.length === 0 ? (
            <span className="min-w-0 text-xs text-[var(--color-muted)]">{t("live.noAttention")}</span>
          ) : null}
        </CardHeader>
        {attention.length > 0 ? (
          <CardContent>
            <p id="live-attention-scroll-hint" className="mb-1 text-[10px] text-[var(--color-muted)]">
              {t("common.horizontalScrollHint")}
            </p>
            <div className="rounded-lg border p-1 overflow-x-auto" tabIndex={0} aria-label={t("live.attentionScrollLabel")} aria-describedby="live-attention-scroll-hint">
              {attention.map((n) => (
                <LiveNodeRow
                  key={n.session_id}
                  node={n}
                  depth={0}
                  childrenByParent={activeChildrenByParent}
                  now={now}
                  justProgressedIds={justProgressed}
                  onOpenSession={onOpenSession}
                  attentionHint={hasActiveDescendant.has(n.session_id) ? "waiting" : "isolated"}
                />
              ))}
            </div>
          </CardContent>
        ) : null}
          </Card>

          <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>
              {healthFilter
                ? t("live.filteredBy", { label: t(`live.health.${healthFilter}`), count: fmtInt(filteredFlat.length) })
                : t(roots.length === 1 ? "live.sessionsAndTasksOne" : "live.sessionsAndTasks", { count: fmtInt(roots.length) })}
            </span>
            <div className="flex items-center gap-2">
              {healthFilter ? (
                <button
                  type="button"
                  className="flex items-center gap-1 rounded-md border border-[var(--color-border)] px-2 py-0.5 text-xs text-[var(--color-muted)] hover:text-[var(--color-fg)]"
                  onClick={() => setHealthFilter(null)}
                >
                  <X size={11} /> {t("common.clearFilter")}
                </button>
              ) : null}
              <LiveLegendPopover />
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!data ? (
            <div className="text-sm text-[var(--color-muted)]">{t("common.loading")}</div>
          ) : healthFilter ? (
            filteredFlat.length === 0 ? (
              <div className="text-sm text-[var(--color-muted)]">{t("live.noState")}</div>
            ) : (
              <>
                <p id="live-filtered-scroll-hint" className="mb-1 text-[10px] text-[var(--color-muted)]">
                  {t("common.horizontalScrollHint")}
                </p>
                <div className="max-h-[640px] overflow-auto rounded-lg border p-1" tabIndex={0} aria-label={t("live.treeScrollLabel")} aria-describedby="live-filtered-scroll-hint">
                {filteredFlat.map((n) => (
                  <LiveNodeRow
                    key={n.session_id}
                    node={n}
                    depth={0}
                    childrenByParent={emptyChildren}
                    now={now}
                    justProgressedIds={justProgressed}
                    onOpenSession={onOpenSession}
                  />
                ))}
                </div>
              </>
            )
          ) : roots.length === 0 ? (
            <div className="text-sm text-[var(--color-muted)]">{t("live.noWindow")}</div>
          ) : (
            <>
              <p id="live-tree-scroll-hint" className="mb-1 text-[10px] text-[var(--color-muted)]">
                {t("common.horizontalScrollHint")}
              </p>
              <div className="max-h-[640px] overflow-auto rounded-lg border p-1" tabIndex={0} aria-label={t("live.treeScrollLabel")} aria-describedby="live-tree-scroll-hint">
              {roots.map((r) => (
                <LiveNodeRow
                  key={r.session_id}
                  node={r}
                  depth={0}
                  childrenByParent={childrenByParent}
                  now={now}
                  justProgressedIds={justProgressed}
                  onOpenSession={onOpenSession}
                />
              ))}
              </div>
            </>
          )}
        </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
