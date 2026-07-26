import { Cell, ErrorBar, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from "recharts";
import type { EfficiencyFrontierRow } from "@/lib/api";
import { fmtInt, fmtM, fmtPct } from "@/lib/utils";
import { useI18n } from "@/i18n/context";
import { CATEGORY_COLORS, CHART_COLORS, chartColorForKey } from "./chartColors";

interface Point {
  model: string;
  sessions: number;
  tokens_per_session: number;
  quality: number;
  qualityLo: number | null;
  qualityHi: number | null;
  errorY: [number, number];
  highlighted: boolean;
  fill: string;
  toolSuccess: number | null;
  toolErrorRate: number | null;
}

const TOP_N = 18;
const HIGHLIGHT_N = 3;
const LOG_X_DOMAIN_HEADROOM_RATIO = 0.65;

function resolveLogSafeXDomain(points: readonly Point[]): [number, number] {
  const positiveTokens = points.map((point) => point.tokens_per_session).filter((value) => value > 0);
  const dataMin = Math.min(...positiveTokens);
  const dataMax = Math.max(...positiveTokens);

  if (!Number.isFinite(dataMin) || !Number.isFinite(dataMax)) return [1, 1 / LOG_X_DOMAIN_HEADROOM_RATIO];

  return [dataMin * LOG_X_DOMAIN_HEADROOM_RATIO, dataMax / LOG_X_DOMAIN_HEADROOM_RATIO];
}

export function FrontierScatter({ rows }: { rows: EfficiencyFrontierRow[] }) {
  const { t } = useI18n();
  const title = t("efficiency.frontierTitle");
  const description = t("chart.frontierDesc");
  const withQuality = rows
    .map((r) => {
      const quality = r.apply_patch_precision;
      if (quality == null) return null;
      const qualityLo = r.rank_lo ?? r.apply_patch_precision_lo ?? null;
      const qualityHi = r.apply_patch_precision_hi ?? null;
      return { ...r, quality, qualityLo, qualityHi };
    })
    .filter((r): r is EfficiencyFrontierRow & { quality: number; qualityLo: number | null; qualityHi: number | null } => r != null)
    .sort((a, b) => b.sessions - a.sessions)
    .slice(0, TOP_N);

  if (withQuality.length === 0)
    return <div className="text-sm text-[var(--color-muted)]">{t("frontier.empty")}</div>;

  const highlightSet = new Set(
    [...withQuality]
      .filter((r) => r.qualityLo != null)
      .sort((a, b) => (b.qualityLo as number) - (a.qualityLo as number))
      .slice(0, HIGHLIGHT_N)
      .map((r) => r.model),
  );

  const models = [...new Set(withQuality.map((r) => r.model))];
  const data: Point[] = withQuality.map((r, i) => ({
    model: r.model,
    sessions: r.sessions,
    tokens_per_session: r.tokens_per_session,
    quality: r.quality,
    qualityLo: r.qualityLo,
    qualityHi: r.qualityHi,
    errorY: [
      r.qualityLo != null ? r.quality - r.qualityLo : 0,
      r.qualityHi != null ? r.qualityHi - r.quality : 0,
    ],
    highlighted: highlightSet.has(r.model),
    fill: chartColorForKey(r.model, models) ?? CATEGORY_COLORS[i % CATEGORY_COLORS.length],
    toolSuccess: r.tool_error_rate == null ? null : 1 - r.tool_error_rate,
    toolErrorRate: r.tool_error_rate,
  }));
  const xDomain = resolveLogSafeXDomain(data);

  return (
    <div className="flex flex-col gap-2">
      <div data-frontier-annotation-band="better" className="text-[10px] leading-tight text-[var(--color-good)]">
        ↖ {t("frontier.better")}
      </div>
      <div className="text-[10px] leading-tight text-[var(--color-muted)]">
        {t("frontier.note", { count: TOP_N })}
      </div>
      <ResponsiveContainer width="100%" height={340}>
        <ScatterChart margin={{ left: 8, right: 24, top: 24, bottom: 24 }} role="img">
          <title>{title}</title>
          <desc>{description}</desc>
          <XAxis
            type="number"
            dataKey="tokens_per_session"
            name={t("efficiency.tokensPerSession")}
            scale="log"
            domain={xDomain}
            stroke={CHART_COLORS.muted}
            fontSize={11}
            tickFormatter={(v) => fmtM(v as number)}
            label={{ value: t("frontier.xAxis"), position: "insideBottom", offset: -14, fill: CHART_COLORS.muted, fontSize: 11 }}
          />
          <YAxis
            type="number"
            dataKey="quality"
            name={t("common.quality")}
            stroke={CHART_COLORS.muted}
            fontSize={11}
            domain={[0, 1]}
            tickFormatter={(v) => fmtPct(v as number, 0)}
            label={{ value: t("frontier.yAxis"), angle: -90, position: "insideLeft", fill: CHART_COLORS.muted, fontSize: 11 }}
          />
          <ZAxis type="number" dataKey="sessions" range={[80, 900]} name={t("frontier.sessions")} />
          <Tooltip
            cursor={{ strokeDasharray: "3 3" }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const firstPayload = payload[0];
              if (!firstPayload) return null;
              const p = firstPayload.payload as Point;
              return (
                <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] p-2 text-xs">
                  <div className="mb-1 font-medium">{p.model}</div>
                  <div>{t("efficiency.tokensPerSession")}: {fmtM(p.tokens_per_session)}</div>
                  <div>{t("frontier.yAxis")}: {fmtPct(p.quality)}</div>
                  <div>{t("frontier.toolSuccess")}: {p.toolSuccess == null ? t("common.unavailable") : fmtPct(p.toolSuccess)}</div>
                  <div>{t("frontier.toolErrorRate")}: {p.toolErrorRate == null ? t("common.unavailable") : fmtPct(p.toolErrorRate)}</div>
                  {p.qualityLo != null && p.qualityHi != null ? (
                    <div className="text-[var(--color-muted)]">
                      {t("common.confidenceInterval")}: [{fmtPct(p.qualityLo)} - {fmtPct(p.qualityHi)}]
                    </div>
                  ) : null}
                  <div>{t("frontier.sessions")}: {fmtInt(p.sessions)}</div>
                  {p.highlighted ? <div className="mt-1 text-[var(--color-good)]">{t("frontier.highlighted")}</div> : null}
                </div>
              );
            }}
          />
          <Scatter data={data} shape="circle" isAnimationActive={false}>
            <ErrorBar dataKey="errorY" width={4} strokeWidth={1.5} direction="y" stroke={CHART_COLORS.muted} />
            {data.map((d, i) => (
              <Cell
                key={`${d.model}-${i}`}
                fill={d.fill}
                fillOpacity={d.highlighted ? 1 : 0.55}
                stroke={d.fill}
                strokeWidth={d.highlighted ? 2 : 1}
              />
            ))}
          </Scatter>
        </ScatterChart>
      </ResponsiveContainer>
      <div data-frontier-annotation-band="worse" className="text-right text-[10px] leading-tight text-[var(--color-bad)]">
        {t("frontier.worse")} ↘
      </div>
      <div className="mt-2 flex flex-wrap gap-3">
        {models.map((m, i) => (
          <span key={m} className="inline-flex items-center gap-1.5 text-xs text-[var(--color-muted)]">
            <span
              className="inline-block size-2.5 rounded-full"
              style={{ background: CATEGORY_COLORS[i % CATEGORY_COLORS.length] ?? CHART_COLORS.accent }}
            />
            {m}
          </span>
        ))}
      </div>
    </div>
  );
}
