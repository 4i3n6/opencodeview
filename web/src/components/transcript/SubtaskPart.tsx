import { useId, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/i18n/context";

type SubtaskPartProps = {
  readonly agent?: string | null | undefined;
  readonly description?: string | null | undefined;
  readonly command?: string | null | undefined;
  readonly model?: { readonly providerID?: string | null; readonly modelID?: string | null } | null | undefined;
  readonly prompt?: string | null | undefined;
  readonly prompt_truncated?: boolean | undefined;
  readonly prompt_full_len?: number | undefined;
  readonly defaultOpen?: boolean | undefined;
};

export function SubtaskPart({ agent, description, command, model, prompt, prompt_truncated, prompt_full_len, defaultOpen = false }: SubtaskPartProps) {
  const { t } = useI18n();
  const reactId = useId();
  const panelId = `${reactId}-subtask-panel`;
  const [open, setOpen] = useState(defaultOpen);
  const modelLabel = model?.modelID ?? null;
  return (
    <div className="rounded-md border bg-[var(--color-panel-2)]">
      <button
        type="button"
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs disabled:cursor-default"
        onClick={() => prompt && setOpen((value) => !value)}
        disabled={!prompt}
        aria-expanded={prompt ? open : undefined}
        aria-controls={prompt ? panelId : undefined}
      >
        {prompt ? open ? <ChevronDown size={14} /> : <ChevronRight size={14} /> : <span className="size-3.5" />}
        <Badge tone="purple">{t("transcript.part.subtask")}</Badge>
        {agent ? <span className="font-medium">{agent}</span> : null}
        {command ? <span className="text-[var(--color-muted)]">{command}</span> : null}
        {modelLabel ? <span className="text-[var(--color-muted)]">{modelLabel}</span> : null}
        {description ? <span className="truncate text-[var(--color-muted)]" title={description}>{description}</span> : null}
      </button>
      {open && prompt ? (
        <div id={panelId} className="border-t px-3 py-2 text-xs">
          <div className="mb-1 text-[10px] uppercase tracking-wide text-[var(--color-muted)]">{t("transcript.prompt")}</div>
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded bg-[var(--color-bg)] p-2 font-mono text-[11px] text-[var(--color-fg)]">{prompt}</pre>
          {prompt_truncated ? <div className="mt-1 text-[10px] text-[var(--color-muted)]">{t("common.truncated")}{prompt_full_len != null ? ` · ${t("common.totalChars", { count: prompt_full_len })}` : ""}</div> : null}
        </div>
      ) : null}
    </div>
  );
}
