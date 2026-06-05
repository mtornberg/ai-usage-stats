import { useState, useCallback } from "react";
import type { ModelStat, UsageRow, Granularity, Metric } from "../data";
import { buildBuckets } from "../data";
import { sourceColor, colorFor } from "../theme";
import { Sparkline } from "./Sparkline";
import {
  fmtUSD, fmtTokens, fmtPct, fmtInt, fmtDuration, fmtRate, shortModel,
} from "../format";

interface Props {
  models: ModelStat[];
  rows: UsageRow[];
  gran: Granularity;
  metric: Metric;
  selectedModel: string | null;
  onSelectModel: (model: string | null) => void;
}

type SortKey =
  | "model" | "requests" | "tokens" | "cost" | "avgCost"
  | "cacheHitRate" | "errorRate" | "reasoningShare"
  | "tokensPerSec" | "avgDurationMs";

type SortDir = "asc" | "desc";

function sortModels(
  models: ModelStat[],
  key: SortKey,
  dir: SortDir,
): ModelStat[] {
  return [...models].sort((a, b) => {
    const av = a[key] ?? -Infinity;
    const bv = b[key] ?? -Infinity;
    if (typeof av === "string" && typeof bv === "string") {
      return dir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
    }
    return dir === "asc"
      ? (av as number) - (bv as number)
      : (bv as number) - (av as number);
  });
}

function SortIcon({ active, dir }: { col?: string; active: boolean; dir: SortDir }) {
  if (!active) {
    return (
      <span className="ml-1 inline-flex flex-col gap-px opacity-20 group-hover:opacity-60 transition-opacity">
        <span className="block h-0 w-0 border-l-[3px] border-r-[3px] border-b-[4px] border-transparent border-b-current" />
        <span className="block h-0 w-0 border-l-[3px] border-r-[3px] border-t-[4px] border-transparent border-t-current" />
      </span>
    );
  }
  return dir === "asc" ? (
    <span className="ml-1 text-violet-400">↑</span>
  ) : (
    <span className="ml-1 text-violet-400">↓</span>
  );
}

function modelSparkline(model: string, rows: UsageRow[], gran: Granularity, metric: Metric): number[] {
  const modelRows = rows.filter((r) => r.model === model);
  const buckets = buildBuckets(modelRows, gran);
  return buckets.map((b) => (metric === "cost" ? b.cost : b.tokens));
}

export function ModelTable({ models, rows, gran, metric, selectedModel, onSelectModel }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("cost");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const handleSort = useCallback((key: SortKey) => {
    setSortKey((prev) => {
      if (prev === key) {
        setSortDir((d) => (d === "desc" ? "asc" : "desc"));
        return key;
      }
      setSortDir("desc");
      return key;
    });
  }, []);

  const sorted = sortModels(models, sortKey, sortDir);
  const maxCost = Math.max(...models.map((m) => m.cost), 1e-9);
  const anyDuration = models.some((m) => m.avgDurationMs !== null);
  const hasErrors = models.some((m) => m.errors > 0);

  interface ColDef {
    key: SortKey;
    label: string;
    right?: boolean;
    hide?: boolean;
  }

  const cols: ColDef[] = [
    { key: "model", label: "Model" },
    { key: "requests", label: "Requests", right: true },
    { key: "tokens", label: "Tokens", right: true },
    { key: "cost", label: "Cost", right: true },
    { key: "avgCost", label: "$/req", right: true },
    { key: "cacheHitRate", label: "Cache", right: true },
    { key: "errorRate", label: "Errors", right: true, hide: !hasErrors },
    { key: "reasoningShare", label: "Reasoning", right: true },
    { key: "tokensPerSec", label: "Tok/s", right: true, hide: !anyDuration },
    { key: "avgDurationMs", label: "Avg dur", right: true, hide: !anyDuration },
  ];

  return (
    <div className="max-h-[560px] overflow-auto">
      <table className="w-full border-collapse text-sm">
        <thead className="sticky top-0 z-10 bg-ink-850/95 backdrop-blur">
          <tr>
            {cols.filter((c) => !c.hide).map((col) => (
              <th
                key={col.key}
                onClick={() => handleSort(col.key)}
                className={`group cursor-pointer select-none whitespace-nowrap px-3 py-2 text-[11px] font-medium uppercase tracking-wider text-white/40 hover:text-white/70 transition-colors ${col.right ? "text-right" : "text-left"}`}
              >
                {col.label}
                <SortIcon col={col.key} active={sortKey === col.key} dir={sortDir} />
              </th>
            ))}
            <th className="whitespace-nowrap px-3 py-2 text-[11px] font-medium uppercase tracking-wider text-white/40" style={{ width: 120 }}>
              Trend
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((m, idx) => {
            const spark = modelSparkline(m.model, rows, gran, metric);
            const isSelected = selectedModel === m.model;
            return (
              <tr
                key={m.model}
                onClick={() => onSelectModel(isSelected ? null : m.model)}
                className={`border-t border-white/5 cursor-pointer transition-colors ${
                  isSelected
                    ? "bg-violet-500/10 hover:bg-violet-500/15"
                    : "hover:bg-white/[0.03]"
                }`}
              >
                {/* Model name */}
                <td className="px-3 py-2">
                  <div className="relative flex items-center gap-2">
                    <span
                      className="absolute inset-y-0 left-0 -z-0 rounded bg-violet-500/10 transition-all"
                      style={{ width: `${(m.cost / maxCost) * 100}%` }}
                    />
                    <span className="relative z-10 flex shrink-0 items-center gap-1">
                      {m.sources.map((s) => (
                        <span key={s} className="h-2 w-2 rounded-full" style={{ background: sourceColor(s) }} title={s} />
                      ))}
                    </span>
                    <span
                      className={`relative z-10 truncate max-w-[180px] font-medium ${isSelected ? "text-violet-300" : "text-white/90"}`}
                      title={m.model}
                    >
                      {shortModel(m.model)}
                    </span>
                    {m.providers.length > 0 && (
                      <span className="relative z-10 hidden truncate text-[10px] text-white/35 xl:block" title={m.providers.join(", ")}>
                        {m.providers[0]}{m.providers.length > 1 ? ` +${m.providers.length - 1}` : ""}
                      </span>
                    )}
                  </div>
                </td>
                {/* Requests */}
                <td className="px-3 py-2 text-right font-mono text-white/70">{fmtInt(m.requests)}</td>
                {/* Tokens */}
                <td className="px-3 py-2 text-right font-mono text-white/70">{fmtTokens(m.tokens)}</td>
                {/* Cost */}
                <td className="px-3 py-2 text-right font-mono text-white">{fmtUSD(m.cost)}</td>
                {/* $/req */}
                <td className="px-3 py-2 text-right font-mono text-white/50">{fmtUSD(m.avgCost, 4)}</td>
                {/* Cache hit */}
                <td className="px-3 py-2 text-right font-mono text-emerald-300/80">{fmtPct(m.cacheHitRate)}</td>
                {/* Errors */}
                {hasErrors && (
                  <td
                    className={`px-3 py-2 text-right font-mono ${
                      m.errorRate > 0.05 ? "text-red-400" : m.errorRate > 0 ? "text-amber-300/70" : "text-white/30"
                    }`}
                  >
                    {m.errors > 0 ? fmtPct(m.errorRate) : "—"}
                  </td>
                )}
                {/* Reasoning */}
                <td className="px-3 py-2 text-right font-mono text-white/50">
                  {m.reasoning > 0 ? fmtPct(m.reasoningShare) : "—"}
                </td>
                {/* Tok/s */}
                {anyDuration && <td className="px-3 py-2 text-right font-mono text-white/50">{fmtRate(m.tokensPerSec)}</td>}
                {/* Avg dur */}
                {anyDuration && <td className="px-3 py-2 text-right font-mono text-white/50">{fmtDuration(m.avgDurationMs)}</td>}
                {/* Sparkline */}
                <td className="px-3 py-2" style={{ width: 120 }}>
                  <Sparkline data={spark} color={isSelected ? "#a78bfa" : colorFor(idx)} height={32} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
