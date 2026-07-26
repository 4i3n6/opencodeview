import { describe, expect, test } from "bun:test";
import { SUPPORTED_LOCALES, catalogs, isMessageKey, messageKeys } from "./catalogs";
import { translate } from "./catalogs";
import {
  FORMAT_TIME_ZONE,
  formatCompactNumber,
  formatDecimal,
  formatDurationHours,
  formatDurationSeconds,
  formatNumber,
  formatPercent,
  formatRelativeTime,
  formatYearMonth,
} from "./format";
import { resolveLocale } from "./locale";
import { resolveInitialLocaleState } from "./initial";
import { fmtInt, setFormattingLocale } from "../lib/utils";
import {
  INFO_KIND_LABEL_KEYS,
  KNOWN_FLAG_KEYS,
  LIVE_HEALTH_LABEL_KEYS,
  ORCHESTRATION_ROUTING_DIMENSION_LABEL_KEYS,
  ROUTING_CHART_TOOLTIP_LABEL_KEYS,
  TAB_IDS,
  TERMINAL_EVENT_LABEL_KEYS,
  TIME_DIMENSION_LABEL_KEYS,
  TOOL_STATUS_LABEL_KEYS,
  TRANSCRIPT_PART_LABEL_KEYS,
} from "./mappings";
import { flagMeta } from "../lib/flags";

describe("i18n catalogs", () => {
  test("catalog parity and exactly two supported locales", () => {
    expect(SUPPORTED_LOCALES).toEqual(["en-US", "pt-BR"]);
    const enKeys = Object.keys(catalogs["en-US"]).sort();
    const ptKeys = Object.keys(catalogs["pt-BR"]).sort();
    expect(ptKeys).toEqual(enKeys);
    expect(enKeys.length).toBeGreaterThan(100);
  });

  test("pt-BR catalog uses natural Portuguese for representative Wave 4 user-facing labels", () => {
    expect(translate("pt-BR", "common.tools")).toBe("Ferramentas");
    expect(translate("pt-BR", "common.calls")).toBe("Chamadas");
    expect(translate("pt-BR", "common.toolCalls")).toBe("Chamadas de ferramenta");
    expect(translate("pt-BR", "common.toolErrorRate")).toBe("Taxa de erro de ferramenta");
    expect(translate("pt-BR", "common.reasoning")).toBe("raciocínio");
    expect(translate("pt-BR", "common.input")).toBe("entrada");
    expect(translate("pt-BR", "common.output")).toBe("saída");
    expect(translate("pt-BR", "efficiency.reasoningRatio")).toBe("Proporção de raciocínio");
    expect(translate("pt-BR", "efficiency.cacheReuse")).toBe("Reuso de cache");
    expect(translate("pt-BR", "efficiency.outputInput")).toBe("Saída/entrada");
    expect(translate("pt-BR", "project.additions")).toBe("adições (diff)");
    expect(translate("pt-BR", "session.transcript")).toBe("Transcrição");
    expect(translate("pt-BR", "quality.gapsDetected", { count: 3 })).toBe("lacunas detectadas: 3");
    expect(translate("en-US", "live.sessionsAndTasksOne", { count: 1 })).toBe("Live sessions and tasks (1 root)");
    expect(translate("pt-BR", "live.sessionsAndTasksOne", { count: 1 })).toBe("Sessões e tarefas ao vivo (1 raiz)");
    expect(translate("en-US", "live.sessionsAndTasks", { count: 2 })).toBe("Live sessions and tasks (2 roots)");
    expect(translate("pt-BR", "live.sessionsAndTasks", { count: 2 })).toBe("Sessões e tarefas ao vivo (2 raízes)");
    expect(translate("pt-BR", "transcript.part.subtask")).toBe("subtarefa");
  });

  test("pt-BR catalog removes remaining editorial English prose while preserving protocol identifiers", () => {
    expect(translate("pt-BR", "common.knownGap")).toBe("lacuna conhecida");
    expect(translate("pt-BR", "common.autoRefresh", { interval: "5 s" })).toBe("automático a cada 5 s");
    expect(translate("pt-BR", "common.err")).toBe("erro");
    expect(translate("pt-BR", "efficiency.topModels", { count: 5 })).toBe("principais 5 modelos por sessões");
    expect(translate("pt-BR", "frontier.note", { count: 5 })).toBe(
      "principais 5 modelos por sessões; barras verticais = IC 95% da precisão de patch quando disponível; pontos destacados = maior limite inferior",
    );
    expect(translate("pt-BR", "orchestration.totalDelegations")).toBe("Total de delegações");
    expect(translate("pt-BR", "orchestration.subagentTokenSub")).toBe("tokens com profundidade>0 / total");
    expect(translate("pt-BR", "orchestration.depthHint")).toBe(
      "profundidade 0 = sessão primária (orquestração); profundidade>=1 = subagentes (execução)",
    );
    expect(translate("pt-BR", "orchestration.instantFailuresHint")).toBe(
      "delegações que falharam quase imediatamente após a criação",
    );
    expect(translate("en-US", "chart.spawnDepth")).toBe("Delegation depth");
    expect(translate("pt-BR", "chart.spawnDepth")).toBe("Profundidade");
    expect(translate("pt-BR", "live.legendPulse")).toBe(
      "O ponto pulsando é o rótulo ativo calculado na última atualização. O anel novo só aparece quando chamadas de ferramenta, tokens ou timestamp do banco mudaram desde a atualização anterior.",
    );
    expect(translate("pt-BR", "live.legendSuspect")).toBe(
      "Suspeita significa que o monitor reportou inatividade alta com o turno ainda aberto, ou taxa de erro de ferramenta acima de 40%.",
    );
    expect(translate("pt-BR", "live.lastActivity")).toBe("última atividade real observada entre monitor e banco");
    expect(translate("pt-BR", "live.openLegend")).toBe("Abrir legenda ao vivo");
    expect(translate("pt-BR", "live.rowScrollLabel", { title: "sessão" })).toBe("Scroll horizontal da linha ao vivo de sessão");
    expect(translate("pt-BR", "live.legendReadOnly")).toContain("Visualização somente leitura.");
    expect(translate("pt-BR", "live.legendClosedHtml")).toContain("Visualização somente leitura.");
    expect(translate("pt-BR", "live.legendReadOnly")).not.toContain("Leitura somente leitura.");
    expect(translate("pt-BR", "live.legendClosedHtml")).not.toContain("Leitura somente leitura.");
    expect(translate("pt-BR", "common.horizontalScrollHint")).toBe("Role horizontalmente para ver todo o conteúdo.");
    expect(translate("pt-BR", "orchestration.collapseBranch", { title: "raiz" })).toBe("Recolher ramo de delegação raiz");
    expect(translate("pt-BR", "terminal.poll_timeout")).toBe("timeout de inatividade");
    expect(translate("pt-BR", "flag.data_quality_gap.description")).toBe(
      "mês da sessão em janela conhecida de baixa cobertura de summary_additions (2026-06/07)",
    );
    expect(translate("pt-BR", "flag.patch_waste.description")).toBe(
      "muitas tentativas de patch, nenhum apply_patch ok, zero adições",
    );
  });

  test("all typed mapping keys point at canonical message keys", () => {
    const mappedKeys = [
      ...Object.values(INFO_KIND_LABEL_KEYS),
      ...Object.values(KNOWN_FLAG_KEYS).flatMap((flag) => [flag.label, flag.description]),
      ...Object.values(LIVE_HEALTH_LABEL_KEYS),
      ...Object.values(TERMINAL_EVENT_LABEL_KEYS),
      ...Object.values(TOOL_STATUS_LABEL_KEYS),
      ...Object.values(TRANSCRIPT_PART_LABEL_KEYS),
      ...Object.values(ORCHESTRATION_ROUTING_DIMENSION_LABEL_KEYS),
      ...Object.values(TIME_DIMENSION_LABEL_KEYS),
      ...Object.values(ROUTING_CHART_TOOLTIP_LABEL_KEYS),
    ];
    expect(mappedKeys.every(isMessageKey)).toBe(true);
    expect(messageKeys.length).toBe(Object.keys(catalogs["en-US"]).length);
  });
});

describe("locale resolution", () => {
  test("saved override wins, Portuguese candidates map to pt-BR, everything else falls back to en-US", () => {
    expect(resolveLocale({ saved: "pt-BR", browserLanguages: ["en-US"] })).toBe("pt-BR");
    expect(resolveLocale({ saved: "es-ES", browserLanguages: ["pt-PT", "en-US"] })).toBe("pt-BR");
    expect(resolveLocale({ saved: null, browserLanguages: ["fr-FR", "de-DE"] })).toBe("en-US");
    expect(resolveLocale({ browserLanguages: [] })).toBe("en-US");
  });
});

describe("initial locale activation", () => {
  test("saved pt-BR locale formats numbers before children render", () => {
    setFormattingLocale("en-US");

    const locale = resolveInitialLocaleState({ saved: "pt-BR", browserLanguages: ["en-US"] });

    expect(locale).toBe("pt-BR");
    expect(fmtInt(1234567.4)).toBe("1.234.567");
  });
});

describe("locale-aware formatters", () => {
  test("number, compact number, percent, duration, relative time and year-month are locale-sensitive", () => {
    const now = Date.UTC(2026, 6, 21, 15, 30, 0);
    const past = now - 90_000;

    expect(formatNumber(1234567.4, "en-US")).toBe("1,234,567");
    expect(formatNumber(1234567.4, "pt-BR")).toBe("1.234.567");
    expect(formatCompactNumber(1234000, "en-US")).toBe("1.2M");
    expect(formatCompactNumber(1234000, "pt-BR")).toBe("1,2 mi");
    expect(formatPercent(0.1234, "en-US", 1)).toBe("12.3%");
    expect(formatPercent(0.1234, "pt-BR", 1)).toBe("12,3%");
    expect(formatDecimal(2.125, "en-US", 2)).toBe("2.13");
    expect(formatDecimal(2.125, "pt-BR", 2)).toBe("2,13");
    expect(formatDurationHours(125, "en-US")).toBe("2.1h");
    expect(formatDurationHours(125, "pt-BR")).toBe("2,1 h");
    expect(formatDurationSeconds(95, "en-US")).toBe("1.6min");
    expect(formatDurationSeconds(95, "pt-BR")).toBe("1,6 min");
    expect(formatRelativeTime(past, "en-US", now)).toBe("1 min. ago");
    expect(formatRelativeTime(past, "pt-BR", now)).toBe("há 1 min.");
    expect(formatYearMonth("2026-07", "en-US", FORMAT_TIME_ZONE)).toBe("Jul 2026");
    expect(formatYearMonth("2026-07", "pt-BR", FORMAT_TIME_ZONE)).toBe("jul. de 2026");
  });
});

describe("canonical IDs and typed label coverage", () => {
  test("tab IDs are stable English protocol values", () => {
    expect(TAB_IDS).toEqual(["overview", "live", "consumption", "efficiency", "orchestration", "quality", "tools"]);
  });

  test("known transcript part types, flags, live health and terminal events have localized labels", () => {
    expect(isMessageKey("live.expandNode")).toBe(true);
    expect(isMessageKey("live.collapseNode")).toBe(true);
    expect(isMessageKey("live.showCurrentDetail")).toBe(true);
    expect(isMessageKey("live.hideCurrentDetail")).toBe(true);
    expect(Object.keys(TRANSCRIPT_PART_LABEL_KEYS).sort()).toEqual([
      "agent",
      "compaction",
      "file",
      "patch",
      "reasoning",
      "step-finish",
      "step-start",
      "subtask",
      "text",
      "tool",
    ]);
    expect(Object.keys(KNOWN_FLAG_KEYS).sort()).toEqual([
      "context_pressure",
      "data_quality_gap",
      "low_yield_high_cost",
      "omo_metadata_bug",
      "patch_waste",
      "security_anomaly",
      "tool_failure_loop",
      "truncation",
    ]);
    expect(Object.keys(LIVE_HEALTH_LABEL_KEYS).sort()).toEqual(["done", "green", "idle", "red", "yellow"]);
    expect(Object.keys(TERMINAL_EVENT_LABEL_KEYS).sort()).toEqual([
      "aborted_by_user",
      "max_turns",
      "poll_timeout",
      "terminal_error",
    ]);
  });

  test("Wave 4 known labels resolve through typed catalogs while unknown protocol values stay raw", () => {
    expect(Object.keys(INFO_KIND_LABEL_KEYS).sort()).toEqual(["efficiency", "fact", "leverage", "quality", "waste"]);
    expect(translate("en-US", INFO_KIND_LABEL_KEYS.efficiency)).toBe("efficiency");
    expect(translate("pt-BR", INFO_KIND_LABEL_KEYS.efficiency)).toBe("eficiência");

    const knownFlag = flagMeta("patch_waste");
    expect("labelKey" in knownFlag ? translate("pt-BR", knownFlag.labelKey) : knownFlag.label).toBe("baixo rendimento de patch");
    expect("descriptionKey" in knownFlag ? translate("pt-BR", knownFlag.descriptionKey) : knownFlag.description).toBe(
      "muitas tentativas de patch, nenhum apply_patch ok, zero adições",
    );

    const unknownFlag = flagMeta("custom_protocol_flag");
    expect("label" in unknownFlag ? unknownFlag.label : translate("pt-BR", unknownFlag.labelKey)).toBe("custom_protocol_flag");
    expect("description" in unknownFlag ? unknownFlag.description : translate("pt-BR", unknownFlag.descriptionKey)).toBe("custom_protocol_flag");

    expect(translate("pt-BR", TOOL_STATUS_LABEL_KEYS.completed)).toBe("concluído");
    expect(Object.hasOwn(TOOL_STATUS_LABEL_KEYS, "queued_forever")).toBe(false);

    expect(translate("pt-BR", TRANSCRIPT_PART_LABEL_KEYS["step-start"])).toBe("início da etapa");
    expect(translate("en-US", TRANSCRIPT_PART_LABEL_KEYS["step-finish"])).toBe("step finish");
    expect(translate("pt-BR", TRANSCRIPT_PART_LABEL_KEYS.compaction)).toBe("compactação");
    expect(translate("pt-BR", TRANSCRIPT_PART_LABEL_KEYS.agent)).toBe("agente");
  });

  test("orchestration and RoutingChart visible labels are cataloged without changing protocol IDs", () => {
    expect(Object.keys(ORCHESTRATION_ROUTING_DIMENSION_LABEL_KEYS).sort()).toEqual(["category", "model", "subagent_type"]);
    expect(Object.keys(TIME_DIMENSION_LABEL_KEYS).sort()).toEqual(["agent", "model"]);
    expect(translate("pt-BR", ORCHESTRATION_ROUTING_DIMENSION_LABEL_KEYS.category)).toBe("Categoria");
    expect(translate("pt-BR", TIME_DIMENSION_LABEL_KEYS.agent)).toBe("Agente");
    expect(translate("en-US", ROUTING_CHART_TOOLTIP_LABEL_KEYS.background)).toBe("background");
    expect(translate("pt-BR", ROUTING_CHART_TOOLTIP_LABEL_KEYS.background)).toBe("segundo plano");
    expect(translate("en-US", ROUTING_CHART_TOOLTIP_LABEL_KEYS.additionsPerThousandTokens)).toBe("additions/1k tokens");
    expect(translate("pt-BR", ROUTING_CHART_TOOLTIP_LABEL_KEYS.additionsPerThousandTokens)).toBe("adições/1k tokens");
  });
});
