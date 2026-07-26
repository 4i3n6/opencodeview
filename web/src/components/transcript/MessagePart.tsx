import { useId, useState } from "react";
import { ChevronDown, ChevronRight, FileText, GitCommitHorizontal } from "lucide-react";
import type { TranscriptPart } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/i18n/context";
import { TRANSCRIPT_PART_LABEL_KEYS } from "@/i18n/mappings";
import { ToolPart } from "./ToolPart";
import { SubtaskPart } from "./SubtaskPart";

function Divider({ label }: { label: string }) {
  return (
    <div className="my-1 flex items-center gap-2 text-[10px] uppercase tracking-wide text-[var(--color-muted)]">
      <div className="h-px flex-1 bg-[var(--color-border)]" />
      {label}
      <div className="h-px flex-1 bg-[var(--color-border)]" />
    </div>
  );
}

function TextPart({ text, synthetic, truncated, full_len }: { text: string; synthetic?: boolean | undefined; truncated?: boolean | undefined; full_len?: number | undefined }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col gap-1">
      <div className={`whitespace-pre-wrap rounded-md bg-[var(--color-panel-2)] p-3 text-sm leading-relaxed ${synthetic ? "opacity-60" : ""}`}>
        {text}
      </div>
      {truncated ? (
        <div className="text-[10px] text-[var(--color-muted)]">{t("common.truncated")}{full_len != null ? ` · ${t("common.totalChars", { count: full_len })}` : ""}</div>
      ) : null}
    </div>
  );
}

export function ReasoningPart({ text, truncated, full_len, defaultOpen = false }: { readonly text: string; readonly truncated?: boolean | undefined; readonly full_len?: number | undefined; readonly defaultOpen?: boolean | undefined }) {
  const { t } = useI18n();
  const reactId = useId();
  const panelId = `${reactId}-reasoning-panel`;
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-md border border-[color-mix(in_oklab,var(--color-purple)_30%,transparent)] bg-[color-mix(in_oklab,var(--color-purple)_6%,transparent)]">
      <button
        type="button"
        className="flex w-full items-center gap-1.5 px-3 py-1.5 text-left text-xs text-[var(--color-purple)]"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={panelId}
      >
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <span className="font-medium">{t("common.reasoning")}</span>
      </button>
      {open ? (
        <div id={panelId} className="whitespace-pre-wrap px-3 pb-3 text-sm italic text-[var(--color-muted)]">
          {text}
          {truncated ? (
            <div className="mt-1 text-[10px] not-italic text-[var(--color-muted)]">
              {t("common.truncated")}{full_len != null ? ` · ${t("common.totalChars", { count: full_len })}` : ""}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function shortPath(path: string): string {
  const parts = path.split("/");
  return parts.length > 3 ? `.../${parts.slice(-2).join("/")}` : path;
}

function PatchPart({ hash, files }: { hash?: string | null | undefined; files: string[] }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col gap-1.5 rounded-md border bg-[var(--color-panel-2)] p-2.5">
      <div className="flex items-center gap-1.5 text-xs text-[var(--color-muted)]">
        <GitCommitHorizontal size={13} />
        {t(TRANSCRIPT_PART_LABEL_KEYS.patch)}
        {hash ? <span className="font-mono text-[10px]">{hash.slice(0, 10)}</span> : null}
      </div>
      <div className="flex flex-wrap gap-1">
        {files.length === 0 ? (
          <span className="text-xs text-[var(--color-muted)]">{t("transcript.noFiles")}</span>
        ) : (
          files.map((f, i) => (
            <Badge key={`${f}-${i}`} tone="accent" title={f}>
              {shortPath(f)}
            </Badge>
          ))
        )}
      </div>
    </div>
  );
}

export function MessagePartView({ part }: { part: TranscriptPart }) {
  const { t } = useI18n();
  switch (part.type) {
    case "text":
      return <TextPart text={part.text} synthetic={part.synthetic} truncated={part.truncated} full_len={part.full_len} />;
    case "reasoning":
      return <ReasoningPart text={part.text} truncated={part.truncated} full_len={part.full_len} />;
    case "tool":
      return (
        <ToolPart
          tool={part.tool}
          status={part.status}
          title={part.title}
          duration_s={part.duration_s}
          input={part.input}
          output={part.output}
          error={part.error}
          input_truncated={part.input_truncated}
          output_truncated={part.output_truncated}
          error_truncated={part.error_truncated}
        />
      );
    case "patch":
      return <PatchPart hash={part.hash} files={part.files} />;
    case "file":
      return (
        <div className="flex items-center gap-1.5 text-xs text-[var(--color-muted)]">
          <FileText size={13} /> {t("transcript.fileRead")}{part.path ? `: ${part.path}` : ""}
          {part.mime ? <span className="opacity-60">({part.mime})</span> : null}
        </div>
      );
    case "subtask":
      return (
        <SubtaskPart
          agent={part.agent}
          description={part.description}
          command={part.command}
          model={part.model}
          prompt={part.prompt}
          prompt_truncated={part.prompt_truncated}
          prompt_full_len={part.prompt_full_len}
        />
      );
    case "step-finish":
      return (
        <Divider
          label={`${t(TRANSCRIPT_PART_LABEL_KEYS["step-finish"])}${part.reason ? ` · ${part.reason}` : ""}${part.tokens?.total != null ? ` · ${part.tokens.total} ${t("transcript.tokenSuffix")}` : ""}`}
        />
      );
    case "step-start":
      return <Divider label={t(TRANSCRIPT_PART_LABEL_KEYS["step-start"])} />;
    case "compaction":
      return <Divider label={t(TRANSCRIPT_PART_LABEL_KEYS.compaction)} />;
    case "agent":
      return <Divider label={t(TRANSCRIPT_PART_LABEL_KEYS.agent)} />;
  }
}
