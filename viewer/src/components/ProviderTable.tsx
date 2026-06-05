import { useState, useCallback } from "react";
import type { ProviderStat, UsageRow, Granularity, Metric } from "../data";
import { buildBuckets } from "../data";
import { SOURCE_LABEL, type SourceId } from "../data";
import { sourceColor } from "../theme";
import { Sparkline } from "./Sparkline";
import { fmtUSD, fmtTokens, fmtPct, fmtInt, fmtDuration, fmtRate } from "../format";

const PROVIDER_COLOR: Record<string, string> = {
  "Anthropic":       "#d97757",
  "GitHub Copilot":  "#22d3ee",
  "Amazon Bedrock":  "#fbbf24",
  "Azure":           "#60a5fa",
  "OpenAI":          "#a3e635",
  "LM Studio":       "#c084fc",
  "OpenCode":        "#f472b6",
  "Google":          "#34d399",
};
function providerColor(name: string): string {
  return PROVIDER_COLOR[name] ?? "#a78bfa";
}

interface Props {
  providers: ProviderStat[];
  rows: UsageRow[];
  gran: Granularity;
  metric: Metric;
  selectedProvider: string | null;
  onSelectProvider: (p: string | null) => void;
}

type SortKey =
  | "provider" | "requests" | "tokens" | "cost" | "avgCost"
  | "cacheHitRate" | "errorRate" | "tokensPerSec" | "avgDurationMs";

type SortDir = "asc" | "desc";

function sorted(items: ProviderStat[], key: SortKey, dir: SortDir): ProviderStat[] {
  return [...items].sort((a, b) => {
    const av = a[key] ?? -Infinity;
    const bv = b[key] ?? -Infinity;
    if (typeof av === "string" && typeof bv === "string")
      return dir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
    return dir === "asc" ? (av as number) - (bv as number) : (bv as number) - (av as number);
  });
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return (
    <span className="ml-1 inline-flex flex-col gap-px opacity-20 group-hover:opacity-60 transition-opacity">
      <span className="block h-0 w-0 border-l-[3px] border-r-[3px] border-b-[4px] border-transparent border-b-current" />
      <span className="block h-0 w-0 border-l-[3px] border-r-[3px] border-t-[4px] border-transparent border-t-current" />
    </span>
  );
  return dir === "asc" ? <span className="ml-1 text-violet-400">↑</span> : <span className="ml-1 text-violet-400">↓</span>;
}

function providerSparkline(provider: string, rows: UsageRow[], gran: Granularity, metric: Metric): number[] {
  const pRows = rows.filter((r) => r.provider === provider);
  return buildBuckets(pRows, gran).map((b) => (metric === "cost" ? b.cost : b.tokens));
}

export function ProviderTable({ providers, rows, gran, metric, selectedProvider, onSelectProvider }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("cost");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const handleSort = useCallback((key: SortKey) => {
    setSortKey((prev) => {
      if (prev === key) { setSortDir((d) => (d === "desc" ? "asc" : "desc")); return key; }
      setSortDir("desc"); return key;
    });
  }, []);

  const rows2 = sorted(providers, sortKey, sortDir);
  const maxCost = Math.max(...providers.map((p) => p.cost), 1e-9);
  const anyDuration = providers.some((p) => p.avgDurationMs !== null);
  const hasErrors = providers.some((p) => p.errors > 0);

  type ColDef = { key: SortKey; label: string; right?: boolean; hide?: boolean };
  const cols: ColDef[] = [
    { key: "provider", label: "Provider" },
    { key: "requests", label: "Requests", right: true },
    { key: "tokens", label: "Tokens", right: true },
    { key: "cost", label: "Cost", right: true },
    { key: "avgCost", label: "$/req", right: true },
    { key: "cacheHitRate", label: "Cache", right: true },
    { key: "errorRate", label: "Errors", right: true, hide: !hasErrors },
    { key: "tokensPerSec", label: "Tok/s", right: true, hide: !anyDuration },
    { key: "avgDurationMs", label: "Avg dur", right: true, hide: !anyDuration },
  ];

  return (
    <div className="max-h-[480px] overflow-auto">
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
                <SortIcon active={sortKey === col.key} dir={sortDir} />
              </th>
            ))}
            <th className="whitespace-nowrap px-3 py-2 text-[11px] font-medium uppercase tracking-wider text-white/40" style={{ width: 120 }}>Trend</th>
            <th className="px-3 py-2 text-[11px] font-medium uppercase tracking-wider text-white/40 text-right">Models · Sources</th>
          </tr>
        </thead>
        <tbody>
          {rows2.map((p) => {
            const isSelected = selectedProvider === p.provider;
            const color = providerColor(p.provider);
            const spark = providerSparkline(p.provider, rows, gran, metric);
            return (
              <tr
                key={p.provider}
                onClick={() => onSelectProvider(isSelected ? null : p.provider)}
                className={`border-t border-white/5 cursor-pointer transition-colors ${
                  isSelected ? "bg-violet-500/10 hover:bg-violet-500/15" : "hover:bg-white/[0.03]"
                }`}
              >
                {/* Provider name */}
                <td className="px-3 py-2">
                  <div className="relative flex items-center gap-2.5">
                    <span
                      className="absolute inset-y-0 left-0 -z-0 rounded"
                      style={{ width: `${(p.cost / maxCost) * 100}%`, background: color + "18" }}
                    />
                    <span
                      className="relative z-10 h-3 w-3 shrink-0 rounded-full"
                      style={{ background: color }}
                    />
                    <span className={`relative z-10 font-medium ${isSelected ? "text-violet-300" : "text-white/90"}`}>
                      {p.provider}
                    </span>
                  </div>
                </td>
                {/* Requests */}
                <td className="px-3 py-2 text-right font-mono text-white/70">{fmtInt(p.requests)}</td>
                {/* Tokens */}
                <td className="px-3 py-2 text-right font-mono text-white/70">{fmtTokens(p.tokens)}</td>
                {/* Cost */}
                <td className="px-3 py-2 text-right font-mono text-white">{fmtUSD(p.cost)}</td>
                {/* $/req */}
                <td className="px-3 py-2 text-right font-mono text-white/50">{fmtUSD(p.avgCost, 4)}</td>
                {/* Cache */}
                <td className="px-3 py-2 text-right font-mono text-emerald-300/80">{fmtPct(p.cacheHitRate)}</td>
                {/* Errors */}
                {hasErrors && (
                  <td className={`px-3 py-2 text-right font-mono ${p.errorRate > 0.05 ? "text-red-400" : p.errorRate > 0 ? "text-amber-300/70" : "text-white/30"}`}>
                    {p.errors > 0 ? fmtPct(p.errorRate) : "—"}
                  </td>
                )}
                {/* Tok/s */}
                {anyDuration && <td className="px-3 py-2 text-right font-mono text-white/50">{fmtRate(p.tokensPerSec)}</td>}
                {/* Avg dur */}
                {anyDuration && <td className="px-3 py-2 text-right font-mono text-white/50">{fmtDuration(p.avgDurationMs)}</td>}
                {/* Sparkline */}
                <td className="px-3 py-2" style={{ width: 120 }}>
                  <Sparkline data={spark} color={color} height={32} />
                </td>
                {/* Models · Sources */}
                <td className="px-3 py-2 text-right">
                  <div className="flex items-center justify-end gap-1.5">
                    <span className="text-xs text-white/40">{p.models.length} {p.models.length === 1 ? "model" : "models"}</span>
                    <span className="text-white/20">·</span>
                    <span className="flex items-center gap-1">
                      {p.sources.map((s) => (
                        <span key={s} title={SOURCE_LABEL[s as SourceId] ?? s}
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ background: sourceColor(s) }}
                        />
                      ))}
                    </span>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
