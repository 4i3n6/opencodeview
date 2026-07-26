import { useId, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/i18n/context";
import { TOOL_STATUS_LABEL_KEYS, isKnownToolStatus } from "@/i18n/mappings";
import { fmtDurationS } from "@/lib/utils";

function toolStatusTone(status: string | null | undefined): "good" | "warn" | "bad" | "neutral" {
  const normalized = (status ?? "").toLowerCase();
  if (normalized === "completed" || normalized === "success" || normalized === "ok") return "good";
  if (normalized === "error" || normalized === "failed" || normalized === "failure") return "bad";
  if (normalized === "running" || normalized === "pending") return "warn";
  return "neutral";
}

function toolStatusLabel(status: string | null | undefined, t: ReturnType<typeof useI18n>["t"]): string {
  if (!status) return "?";
  const normalized = status.toLowerCase();
  return isKnownToolStatus(normalized) ? t(TOOL_STATUS_LABEL_KEYS[normalized]) : status;
}

function stringifyToolField(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

type ToolPartProps = {
  readonly tool: string;
  readonly status?: string | null | undefined;
  readonly title?: string | null | undefined;
  readonly duration_s?: number | null | undefined;
  readonly input?: unknown;
  readonly output?: unknown;
  readonly error?: unknown;
  readonly input_truncated?: boolean | undefined;
  readonly output_truncated?: boolean | undefined;
  readonly error_truncated?: boolean | undefined;
  readonly defaultOpen?: boolean | undefined;
};

export function ToolPart({ tool, status, title, duration_s, input, output, error, input_truncated, output_truncated, error_truncated, defaultOpen = false }: ToolPartProps) {
  const { t } = useI18n();
  const reactId = useId();
  const panelId = `${reactId}-tool-panel`;
  const [open, setOpen] = useState(defaultOpen);
  const inputStr = stringifyToolField(input);
  const outputStr = stringifyToolField(output);
  const errorStr = stringifyToolField(error);
  const hasBody = inputStr != null || outputStr != null || errorStr != null;
  return (
    <div className="rounded-md border bg-[var(--color-panel-2)]">
      <button
        type="button"
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs disabled:cursor-default"
        onClick={() => hasBody && setOpen((value) => !value)}
        disabled={!hasBody}
        aria-expanded={hasBody ? open : undefined}
        aria-controls={hasBody ? panelId : undefined}
      >
        {hasBody ? open ? <ChevronDown size={14} /> : <ChevronRight size={14} /> : <span className="size-3.5" />}
        <span className="font-medium">{tool}</span>
        <Badge tone={toolStatusTone(status)}>{toolStatusLabel(status, t)}</Badge>
        {duration_s != null ? <span className="text-[var(--color-muted)]">{fmtDurationS(duration_s)}</span> : null}
        {title ? <span className="truncate text-[var(--color-muted)]" title={title}>{title}</span> : null}
      </button>
      {open ? (
        <div id={panelId} className="flex flex-col gap-2 border-t px-3 py-2 text-xs">
          {inputStr != null ? <FieldBlock label={t("common.input")} value={inputStr} truncated={input_truncated} /> : null}
          {outputStr != null ? <FieldBlock label={t("common.output")} value={outputStr} truncated={output_truncated} /> : null}
          {errorStr != null ? <FieldBlock label={t("common.error")} value={errorStr} truncated={error_truncated} tone="bad" /> : null}
        </div>
      ) : null}
    </div>
  );
}

function FieldBlock({ label, value, truncated, tone = "neutral" }: { readonly label: string; readonly value: string; readonly truncated?: boolean | undefined; readonly tone?: "bad" | "neutral" }) {
  const { t } = useI18n();
  const labelClass = tone === "bad" ? "text-[var(--color-bad)]" : "text-[var(--color-muted)]";
  const valueClass = tone === "bad" ? "text-[var(--color-bad)]" : "text-[var(--color-fg)]";
  return (
    <div>
      <div className={`mb-1 text-[10px] uppercase tracking-wide ${labelClass}`}>{label}</div>
      <pre className={`max-h-64 overflow-auto whitespace-pre-wrap rounded bg-[var(--color-bg)] p-2 font-mono text-[11px] ${valueClass}`}>{value}</pre>
      {truncated ? <div className="mt-1 text-[10px] text-[var(--color-muted)]">{t("common.truncated")}</div> : null}
    </div>
  );
}
