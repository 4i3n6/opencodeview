import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { OrchestrationTopRow, OrchestrationTreeNode } from "@/lib/api";
import { useI18n } from "@/i18n/context";
import { fmtHours, fmtInt, fmtM } from "@/lib/utils";

function TreeNode({
  node,
  childrenByParent,
  onOpenSession,
}: {
  node: OrchestrationTreeNode;
  childrenByParent: Map<string, OrchestrationTreeNode[]>;
  onOpenSession?: ((id: string) => void) | undefined;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(true);
  const kids = childrenByParent.get(node.session_id) ?? [];
  const hasKids = kids.length > 0;
  const title = node.title || node.session_id;

  return (
    <div>
      <div
        className="flex items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-[var(--color-panel-2)]/50"
        style={{ paddingLeft: node.depth * 18 + 6 }}
      >
        <button
          type="button"
          className="flex size-4 items-center justify-center text-[var(--color-muted)] disabled:opacity-0"
          disabled={!hasKids}
          aria-label={open ? t("orchestration.collapseBranch", { title }) : t("orchestration.expandBranch", { title })}
          aria-expanded={hasKids ? open : undefined}
          onClick={(e) => {
            e.stopPropagation();
            setOpen((v) => !v);
          }}
        >
          {hasKids ? open ? <ChevronDown size={14} /> : <ChevronRight size={14} /> : null}
        </button>
        {onOpenSession ? (
          <button type="button" className="min-w-0 truncate rounded text-left font-medium underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]" title={title} aria-label={t("common.openSessionNamed", { title })} onClick={() => onOpenSession?.(node.session_id)}>
            {title}
          </button>
        ) : (
          <span className="truncate font-medium" title={title}>{title}</span>
        )}
        <span className="shrink-0 rounded-md border border-[var(--color-border)] bg-[var(--color-panel-2)] px-1.5 py-0.5 text-[10px] text-[var(--color-muted)]">
          {node.agent ?? "?"}
        </span>
        <span className="shrink-0 text-[10px] text-[var(--color-muted)]">{node.dominant_model_id ?? "—"}</span>
        <div className="flex-1" />
        <span className="shrink-0 text-xs tabular-nums text-[var(--color-accent)]">{fmtM(node.tokens)}</span>
        <span className="shrink-0 w-14 text-right text-xs tabular-nums text-[var(--color-purple)]">
          {fmtHours(node.active_min)}
        </span>
      </div>
      {hasKids && open ? (
        <div>
          {kids.map((k) => (
            <TreeNode key={k.session_id} node={k} childrenByParent={childrenByParent} onOpenSession={onOpenSession} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function DelegationTree({
  top,
  selected,
  onSelect,
  tree,
  onOpenSession,
}: {
  top: OrchestrationTopRow[] | undefined;
  selected: string | null;
  onSelect: (id: string | null) => void;
  tree: OrchestrationTreeNode[] | undefined;
  onOpenSession?: ((id: string) => void) | undefined;
}) {
  const { t } = useI18n();
  const { childrenByParent, root } = useMemo(() => {
    const m = new Map<string, OrchestrationTreeNode[]>();
    for (const n of tree ?? []) {
      if (n.depth === 0 || !n.parent_id) continue;
      const arr = m.get(n.parent_id) ?? [];
      arr.push(n);
      m.set(n.parent_id, arr);
    }
    const root = (tree ?? []).find((n) => n.depth === 0) ?? null;
    return { childrenByParent: m, root };
  }, [tree]);

  const rootRow = (top ?? []).find((t) => t.session_id === selected);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-sm text-[var(--color-muted)]" htmlFor="tree-session">
          {t("orchestration.primarySession")}
        </label>
        <select
          id="tree-session"
          className="h-8 min-w-64 rounded-md border bg-[var(--color-panel)] px-2 text-sm text-[var(--color-fg)]"
          value={selected ?? ""}
          onChange={(e) => onSelect(e.target.value || null)}
        >
          <option value="">{t("orchestration.selectPrimary")}</option>
          {(top ?? []).map((row) => (
            <option key={row.session_id} value={row.session_id}>
              {(row.title || row.session_id).slice(0, 80)} · {fmtInt(row.descendants)} {t("orchestration.descendants")} · {fmtM(row.tokens_subtree)}
            </option>
          ))}
        </select>
        {rootRow ? (
          <span className="text-xs text-[var(--color-muted)]">
            {t("orchestration.subtree", {
              descendants: fmtInt(rootRow.descendants),
              tokens: fmtM(rootRow.tokens_subtree),
              time: fmtHours(rootRow.active_min_subtree),
            })}
          </span>
        ) : null}
      </div>

      {!selected ? (
        <div className="text-sm text-[var(--color-muted)]">{t("orchestration.selectPrimaryPrompt")}</div>
      ) : tree == null ? (
        <div className="text-sm text-[var(--color-muted)]">{t("common.loading")}</div>
      ) : !root ? (
        <div className="text-sm text-[var(--color-muted)]">{t("orchestration.noSubagents")}</div>
      ) : (
        <div className="max-h-[480px] overflow-auto rounded-lg border p-1" tabIndex={0} aria-label={t("orchestration.treeScrollLabel")} aria-describedby="delegation-tree-scroll-hint">
          <p id="delegation-tree-scroll-hint" className="sr-only">{t("common.horizontalScrollHint")}</p>
          <TreeNode node={root} childrenByParent={childrenByParent} onOpenSession={onOpenSession} />
        </div>
      )}
    </div>
  );
}
