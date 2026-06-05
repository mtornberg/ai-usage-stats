import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  loadReportData, buildBuckets, byModel, byProject, bySource, byProvider,
  buildModelTable, buildModelMix, buildProviderTable, buildProviderMix, totals,
  filterRows, activityMatrix,
  SOURCE_LABEL,
  type Granularity, type Metric, type SourceId,
} from "./data";
import { sampleData } from "./sampleData";
import { sourceColor } from "./theme";
import { SegmentedControl } from "./components/SegmentedControl";
import { Tabs } from "./components/Tabs";
import { SourceFilter } from "./components/SourceFilter";
import { ProviderFilter } from "./components/ProviderFilter";
import { StatCard } from "./components/StatCard";
import { UsageChart } from "./components/UsageChart";
import { ModelDonut } from "./components/ModelDonut";
import { ProjectBars } from "./components/ProjectBars";
import { BucketTable } from "./components/BucketTable";
import { ModelTable } from "./components/ModelTable";
import { ProviderTable } from "./components/ProviderTable";
import { CostCompositionChart } from "./components/CostCompositionChart";
import { ModelMixChart } from "./components/ModelMixChart";
import { Heatmap } from "./components/Heatmap";
import { fmtUSD, fmtTokens, fmtPct, fmtInt } from "./format";

type Tab = "overview" | "models" | "providers" | "cost" | "activity";

const GRAN_OPTS: { value: Granularity; label: string }[] = [
  { value: "day", label: "Daily" },
  { value: "week", label: "Weekly" },
  { value: "month", label: "Monthly" },
  { value: "year", label: "Yearly" },
];
const METRIC_OPTS: { value: Metric; label: string }[] = [
  { value: "cost", label: "Cost" },
  { value: "tokens", label: "Tokens" },
];
const TAB_OPTS: { value: Tab; label: string }[] = [
  { value: "overview", label: "Overview" },
  { value: "models", label: "Models" },
  { value: "providers", label: "Providers" },
  { value: "cost", label: "Cost" },
  { value: "activity", label: "Activity" },
];
const PRICING_LABEL: Record<string, string> = {
  live: "live pricing", cache: "cached pricing", fallback: "bundled pricing",
};

function prettyDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function GranControl({ gran, setGran }: { gran: Granularity; setGran: (g: Granularity) => void }) {
  return <SegmentedControl idPrefix="gran" value={gran} options={GRAN_OPTS} onChange={setGran} />;
}

export default function App() {
  const loaded = loadReportData();
  const data = loaded ?? sampleData;
  const isSample = !loaded;

  const initialTab = (() => {
    const h = typeof window !== "undefined" ? window.location.hash.replace("#", "") : "";
    return (["overview", "models", "providers", "cost", "activity"] as Tab[]).includes(h as Tab)
      ? (h as Tab)
      : "overview";
  })();

  const [tab, setTab] = useState<Tab>(initialTab);
  const [gran, setGran] = useState<Granularity>("day");
  const [metric, setMetric] = useState<Metric>("cost");

  // Source filter
  const [activeSources, setActiveSources] = useState<Set<SourceId>>(
    () => new Set(data.sources.map((s) => s.id)),
  );
  // Provider filter — null = all
  const [activeProviders, setActiveProviders] = useState<Set<string> | null>(null);
  // Model drill-down — null = show all
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  // Provider drill-down — null = show all
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);

  // All rows after source filter (needed to compute available providers)
  const sourceFilteredRows = useMemo(
    () => filterRows(data.rows, activeSources, null),
    [data, activeSources],
  );

  // Derive the full provider list from source-filtered rows
  const allProviders = useMemo(() => byProvider(sourceFilteredRows), [sourceFilteredRows]);

  // Merge explicit provider filter with any provider drill-down from the Providers tab
  const effectiveProviderFilter = useMemo((): Set<string> | null => {
    if (selectedProvider !== null) {
      // If a specific provider is selected via the table, use that (overrides chip filter)
      return new Set([selectedProvider]);
    }
    return activeProviders;
  }, [selectedProvider, activeProviders]);

  // Full filter (source + provider + optional model drill-down)
  const rows = useMemo(
    () => filterRows(data.rows, activeSources, effectiveProviderFilter, selectedModel),
    [data, activeSources, effectiveProviderFilter, selectedModel],
  );

  const t = useMemo(() => totals(rows), [rows]);
  const buckets = useMemo(() => buildBuckets(rows, gran), [rows, gran]);
  const models = useMemo(() => byModel(rows), [rows]);
  const projects = useMemo(() => byProject(rows), [rows]);
  const sources = useMemo(() => bySource(rows), [rows]);
  const providers = useMemo(() => byProvider(rows), [rows]);
  const modelTable = useMemo(() => buildModelTable(rows), [rows]);
  const modelMix = useMemo(() => buildModelMix(rows, gran, metric), [rows, gran, metric]);
  // Use source-filtered (not model-drill-down-filtered) rows for the full provider table
  const providerTableRows = useMemo(
    () => filterRows(data.rows, activeSources, activeProviders, null),
    [data, activeSources, activeProviders],
  );
  const providerTable = useMemo(() => buildProviderTable(providerTableRows), [providerTableRows]);
  const providerMix = useMemo(() => buildProviderMix(providerTableRows, gran, metric), [providerTableRows, gran, metric]);
  const heat = useMemo(() => activityMatrix(data.activity, activeSources, metric), [data, activeSources, metric]);

  const activeBuckets = buckets.filter((b) => b.tokens > 0).length;

  function toggleSource(id: SourceId) {
    setActiveSources((prev) => {
      const next = new Set(prev);
      if (next.has(id)) { if (next.size > 1) next.delete(id); }
      else next.add(id);
      setActiveProviders(null);
      setSelectedModel(null);
      setSelectedProvider(null);
      return next;
    });
  }

  function toggleProvider(name: string) {
    setSelectedModel(null);
    setSelectedProvider(null);
    setActiveProviders((prev) => {
      const all = new Set(allProviders.map((p) => p.name));
      const current = prev ?? all;
      const next = new Set(current);
      if (next.has(name)) {
        if (next.size > 1) next.delete(name);
      } else next.add(name);
      // If all providers selected → null (no filter)
      return next.size === all.size ? null : next;
    });
  }

  const effectiveProviders: Set<string> = activeProviders ?? new Set(allProviders.map((p) => p.name));
  // For the ProviderFilter chip row, don't show provider drill-down as a chip selection
  // (that's handled by the banner instead)

  return (
    <div className="mx-auto max-w-[1180px] px-5 py-8 sm:px-8">
      {/* Header */}
      <header className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 text-lg shadow-lg">
              <span>◇</span>
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-white">AI Usage</h1>
          </div>
          <p className="mt-1.5 text-sm text-white/45">
            {prettyDate(t.firstDate)} – {prettyDate(t.lastDate)} · {fmtInt(t.requests)} requests ·{" "}
            {t.sources} {t.sources === 1 ? "tool" : "tools"} · {data.timezone}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <SegmentedControl idPrefix="metric" value={metric} options={METRIC_OPTS} onChange={setMetric} />
          <div className="flex items-center gap-2 text-[11px] text-white/35">
            <span className="rounded-full border border-white/10 px-2 py-0.5">
              {PRICING_LABEL[data.pricingSource] ?? data.pricingSource}
            </span>
            <span>generated {prettyDate(data.generatedAt)}</span>
          </div>
        </div>
      </header>

      {/* Filters */}
      <div className="mb-3">
        <SourceFilter sources={data.sources} active={activeSources} onToggle={toggleSource} />
      </div>
      {allProviders.length > 1 && (
        <div className="mb-5">
          <ProviderFilter providers={allProviders} active={effectiveProviders} onToggle={toggleProvider} />
        </div>
      )}

      {isSample && (
        <div className="mb-5 rounded-xl border border-amber-400/20 bg-amber-400/5 px-4 py-2.5 text-sm text-amber-200/80">
          Showing sample data (dev mode). The CLI injects your real usage when generating the report.
        </div>
      )}

      {/* Provider drill-down banner */}
      {selectedProvider && !selectedModel && (
        <div className="mb-4 flex items-center justify-between rounded-xl border border-cyan-500/25 bg-cyan-500/10 px-4 py-2.5">
          <div className="flex items-center gap-2.5 text-sm">
            <span className="h-2 w-2 rounded-full bg-cyan-400" />
            <span className="text-white/60">Filtered to provider</span>
            <span className="font-medium text-cyan-300">{selectedProvider}</span>
          </div>
          <button
            onClick={() => setSelectedProvider(null)}
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-white/60 transition-colors hover:bg-white/10 hover:text-white"
          >
            Clear ✕
          </button>
        </div>
      )}

      {/* Model drill-down banner */}
      {selectedModel && (
        <div className="mb-4 flex items-center justify-between rounded-xl border border-violet-500/25 bg-violet-500/10 px-4 py-2.5">
          <div className="flex items-center gap-2.5 text-sm">
            <span className="h-2 w-2 rounded-full bg-violet-400" />
            <span className="text-white/60">Filtered to model</span>
            <span className="font-medium text-violet-300">{selectedModel}</span>
          </div>
          <button
            onClick={() => setSelectedModel(null)}
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-white/60 transition-colors hover:bg-white/10 hover:text-white"
          >
            Clear ✕
          </button>
        </div>
      )}

      {/* Stat cards */}
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Total cost"
          value={fmtUSD(t.cost)}
          sub={`${fmtInt(t.requests)} req${t.errorRate > 0 ? ` · ${fmtPct(t.errorRate)} errors` : ""}`}
          accent="#a78bfa"
          delay={0}
        />
        <StatCard
          label="Total tokens"
          value={fmtTokens(t.tokens)}
          sub={`${fmtTokens(t.output)} output · ${fmtTokens(t.reasoning)} reasoning`}
          accent="#22d3ee"
          delay={0.05}
        />
        <StatCard
          label="Cache read share"
          value={fmtPct(t.cacheHitRate)}
          sub={`${fmtTokens(t.cacheRead)} cached tokens`}
          accent="#34d399"
          delay={0.1}
        />
        <StatCard
          label="Tools · models"
          value={`${t.sources} · ${t.models}`}
          sub={`${t.projects} projects · ${activeBuckets} active ${gran}s`}
          accent="#fbbf24"
          delay={0.15}
        />
      </div>

      {/* Tabs */}
      <div className="mb-5">
        <Tabs value={tab} options={TAB_OPTS} onChange={setTab} />
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.22 }}
        >
          {tab === "overview" && (
            <>
              <div className="card mb-6 p-5">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-semibold text-white/90">
                      {metric === "cost" ? "Spend" : "Token usage"} over time
                    </h2>
                    <p className="text-xs text-white/40">bars = per {gran} · line = cumulative</p>
                  </div>
                  <GranControl gran={gran} setGran={setGran} />
                </div>
                <AnimatePresence mode="wait">
                  <motion.div key={`${gran}-${metric}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}>
                    <UsageChart buckets={buckets} metric={metric} />
                  </motion.div>
                </AnimatePresence>
              </div>

              <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
                <div className="card p-5">
                  <h2 className="mb-4 text-sm font-semibold text-white/90">By tool</h2>
                  <ModelDonut slices={sources} metric={metric} noun="tools" colorOf={(n) => sourceColor(n)} labelOf={(n) => SOURCE_LABEL[n as SourceId] ?? n} />
                </div>
                <div className="card p-5">
                  <h2 className="mb-4 text-sm font-semibold text-white/90">By provider</h2>
                  <ModelDonut slices={providers} metric={metric} noun="providers" />
                </div>
                <div className="card p-5">
                  <h2 className="mb-4 text-sm font-semibold text-white/90">By project</h2>
                  <ProjectBars slices={projects} metric={metric} />
                </div>
              </div>

              <div className="card overflow-hidden p-1.5">
                <div className="flex items-center justify-between px-3.5 py-2.5">
                  <h2 className="text-sm font-semibold text-white/90">
                    {GRAN_OPTS.find((o) => o.value === gran)?.label} breakdown
                  </h2>
                  <span className="text-xs text-white/40">{activeBuckets} periods</span>
                </div>
                <BucketTable buckets={buckets} />
              </div>
            </>
          )}

          {tab === "models" && (
            <>
              <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div className="card p-5">
                  <h2 className="mb-4 text-sm font-semibold text-white/90">Model share</h2>
                  <ModelDonut slices={models} metric={metric} />
                </div>
                <div className="card p-5">
                  <div className="mb-3 flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-white/90">Model mix over time</h2>
                    <GranControl gran={gran} setGran={setGran} />
                  </div>
                  <ModelMixChart data={modelMix.data} models={modelMix.models} metric={metric} />
                </div>
              </div>
              <div className="card overflow-hidden p-1.5">
                <div className="flex items-center justify-between px-3.5 py-2.5">
                  <h2 className="text-sm font-semibold text-white/90">Per-model statistics</h2>
                  <span className="text-xs text-white/40">{modelTable.length} models</span>
                </div>
                <ModelTable
                  models={modelTable}
                  rows={rows}
                  gran={gran}
                  metric={metric}
                  selectedModel={selectedModel}
                  onSelectModel={setSelectedModel}
                />
              </div>
            </>
          )}

          {tab === "providers" && (
            <>
              {/* Provider stat cards — top 4 by cost */}
              <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
                {providerTable.slice(0, 4).map((p, i) => {
                  const COLORS = ["#a78bfa", "#22d3ee", "#fbbf24", "#60a5fa"];
                  return (
                    <StatCard
                      key={p.provider}
                      label={p.provider}
                      value={fmtUSD(p.cost)}
                      sub={`${fmtInt(p.requests)} req · ${fmtTokens(p.tokens)}`}
                      accent={COLORS[i] ?? "#a78bfa"}
                      delay={i * 0.05}
                    />
                  );
                })}
              </div>

              {/* Mix over time */}
              <div className="card mb-6 p-5">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-semibold text-white/90">
                      {metric === "cost" ? "Spend" : "Token usage"} by provider over time
                    </h2>
                    <p className="text-xs text-white/40">stacked area per provider</p>
                  </div>
                  <GranControl gran={gran} setGran={setGran} />
                </div>
                <AnimatePresence mode="wait">
                  <motion.div key={`prov-${gran}-${metric}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}>
                    <ModelMixChart data={providerMix.data} models={providerMix.providers} metric={metric} />
                  </motion.div>
                </AnimatePresence>
              </div>

              {/* Provider table */}
              <div className="card overflow-hidden p-1.5">
                <div className="flex items-center justify-between px-3.5 py-2.5">
                  <h2 className="text-sm font-semibold text-white/90">Per-provider statistics</h2>
                  <span className="text-xs text-white/40">{providerTable.length} providers · click to filter</span>
                </div>
                <ProviderTable
                  providers={providerTable}
                  rows={providerTableRows}
                  gran={gran}
                  metric={metric}
                  selectedProvider={selectedProvider}
                  onSelectProvider={setSelectedProvider}
                />
              </div>
            </>
          )}

          {tab === "cost" && (
            <>
              <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
                <StatCard label="Input" value={fmtUSD(t.costInput)} sub={fmtPct(t.cost ? t.costInput / t.cost : 0)} accent="#60a5fa" />
                <StatCard label="Output" value={fmtUSD(t.costOutput)} sub={fmtPct(t.cost ? t.costOutput / t.cost : 0)} accent="#a78bfa" />
                <StatCard label="Cache write" value={fmtUSD(t.costCacheCreate)} sub={fmtPct(t.cost ? t.costCacheCreate / t.cost : 0)} accent="#fbbf24" />
                <StatCard label="Cache read" value={fmtUSD(t.costCacheRead)} sub={fmtPct(t.cost ? t.costCacheRead / t.cost : 0)} accent="#34d399" />
              </div>
              <div className="card p-5">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-semibold text-white/90">Cost composition over time</h2>
                    <p className="text-xs text-white/40">stacked by token type</p>
                  </div>
                  <GranControl gran={gran} setGran={setGran} />
                </div>
                <CostCompositionChart buckets={buckets} />
              </div>
            </>
          )}

          {tab === "activity" && (
            <div className="card p-5">
              <div className="mb-1 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-white/90">Activity heatmap</h2>
                <span className="text-xs text-white/40">{metric === "cost" ? "cost" : "tokens"} by weekday × hour ({data.timezone})</span>
              </div>
              <p className="mb-4 text-xs text-white/40">When you use AI coding agents most. Toggle Cost/Tokens in the header.</p>
              <Heatmap matrix={heat.matrix} max={heat.max} metric={metric} />
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      <footer className="mt-8 text-center text-xs text-white/25">
        Generated by ai-usage-stats · {data.sources.map((s) => s.label).join(" · ")} · costs estimated from{" "}
        {PRICING_LABEL[data.pricingSource] ?? data.pricingSource}
        {data.unknownModels.length > 0 && ` · no price for ${data.unknownModels.join(", ")}`}
      </footer>
    </div>
  );
}
