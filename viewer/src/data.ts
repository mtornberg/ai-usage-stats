// Types mirror src/types.ts (the CLI's embedded payload).

export type SourceId = "claude-code" | "codex" | "opencode" | "pi";
export type Granularity = "day" | "week" | "month" | "year";
export type Metric = "cost" | "tokens";

export interface UsageRow {
  date: string;
  source: SourceId;
  provider: string;
  model: string;
  project: string;
  requests: number;
  errors: number;
  input: number;
  output: number;
  cacheCreate: number;
  cacheRead: number;
  reasoning: number;
  cost: number;
  costInput: number;
  costOutput: number;
  costCacheCreate: number;
  costCacheRead: number;
  durationMs: number;
  durationCount: number;
}

export interface ActivityCell {
  dow: number;
  hour: number;
  source: SourceId;
  cost: number;
  tokens: number;
  requests: number;
}

export interface SourceSummary {
  id: SourceId;
  label: string;
  requests: number;
  tokens: number;
  cost: number;
  sessions: number;
}

export interface ReportData {
  generatedAt: string;
  pricingSource: "live" | "cache" | "fallback";
  currency: string;
  timezone: string;
  rows: UsageRow[];
  activity: ActivityCell[];
  sources: SourceSummary[];
  unknownModels: string[];
  eventCount: number;
}

export const SOURCE_LABEL: Record<SourceId, string> = {
  "claude-code": "Claude Code",
  codex: "Codex",
  opencode: "OpenCode",
  pi: "Pi (oh-my-pi)",
};

export interface Bucket {
  key: string;
  label: string;
  sublabel: string;
  cost: number;
  tokens: number;
  requests: number;
  input: number;
  output: number;
  cacheCreate: number;
  cacheRead: number;
  reasoning: number;
  costInput: number;
  costOutput: number;
  costCacheCreate: number;
  costCacheRead: number;
}

export interface Slice {
  name: string;
  cost: number;
  tokens: number;
  requests: number;
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];
export const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function asUTC(date: string): Date {
  return new Date(date + "T00:00:00Z");
}
function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function mondayOf(date: string): Date {
  const d = asUTC(date);
  const dow = d.getUTCDay();
  const diff = (dow + 6) % 7;
  d.setUTCDate(d.getUTCDate() - diff);
  return d;
}

function bucketKey(date: string, g: Granularity): string {
  switch (g) {
    case "day": return date;
    case "week": return ymd(mondayOf(date));
    case "month": return date.slice(0, 7);
    case "year": return date.slice(0, 4);
  }
}

function labelFor(key: string, g: Granularity): { label: string; sublabel: string } {
  switch (g) {
    case "day": {
      const d = asUTC(key);
      return { label: `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`, sublabel: String(d.getUTCFullYear()) };
    }
    case "week": {
      const d = asUTC(key);
      return { label: `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`, sublabel: `Week of ${d.getUTCFullYear()}` };
    }
    case "month": {
      const [y, m] = key.split("-");
      return { label: `${MONTHS[Number(m) - 1]}`, sublabel: y };
    }
    case "year":
      return { label: key, sublabel: "" };
  }
}

function fillKeys(min: string, max: string, g: Granularity): string[] {
  const keys: string[] = [];
  if (g === "day") {
    let d = asUTC(min);
    const end = asUTC(max);
    while (d <= end) { keys.push(ymd(d)); d.setUTCDate(d.getUTCDate() + 1); }
  } else if (g === "week") {
    let d = mondayOf(min);
    const end = mondayOf(max);
    while (d <= end) { keys.push(ymd(d)); d.setUTCDate(d.getUTCDate() + 7); }
  } else if (g === "month") {
    let d = asUTC(min.slice(0, 7) + "-01");
    const end = asUTC(max.slice(0, 7) + "-01");
    while (d <= end) { keys.push(ymd(d).slice(0, 7)); d.setUTCMonth(d.getUTCMonth() + 1); }
  } else {
    let y = Number(min.slice(0, 4));
    const endY = Number(max.slice(0, 4));
    while (y <= endY) { keys.push(String(y)); y++; }
  }
  return keys;
}

function emptyBucket(key: string, g: Granularity): Bucket {
  const { label, sublabel } = labelFor(key, g);
  return {
    key, label, sublabel,
    cost: 0, tokens: 0, requests: 0,
    input: 0, output: 0, cacheCreate: 0, cacheRead: 0, reasoning: 0,
    costInput: 0, costOutput: 0, costCacheCreate: 0, costCacheRead: 0,
  };
}

function addRow(b: Bucket, r: UsageRow) {
  b.cost += r.cost;
  b.requests += r.requests;
  b.input += r.input;
  b.output += r.output;
  b.cacheCreate += r.cacheCreate;
  b.cacheRead += r.cacheRead;
  b.reasoning += r.reasoning;
  b.tokens += r.input + r.output + r.cacheCreate + r.cacheRead;
  b.costInput += r.costInput;
  b.costOutput += r.costOutput;
  b.costCacheCreate += r.costCacheCreate;
  b.costCacheRead += r.costCacheRead;
}

export function buildBuckets(rows: UsageRow[], g: Granularity): Bucket[] {
  if (rows.length === 0) return [];
  let min = rows[0].date, max = rows[0].date;
  for (const r of rows) {
    if (r.date < min) min = r.date;
    if (r.date > max) max = r.date;
  }
  const map = new Map<string, Bucket>();
  for (const k of fillKeys(min, max, g)) map.set(k, emptyBucket(k, g));
  for (const r of rows) {
    const k = bucketKey(r.date, g);
    let b = map.get(k);
    if (!b) { b = emptyBucket(k, g); map.set(k, b); }
    addRow(b, r);
  }
  return [...map.values()].sort((a, b) => (a.key < b.key ? -1 : 1));
}

const tokensOf = (r: UsageRow) => r.input + r.output + r.cacheCreate + r.cacheRead;

function breakdown(rows: UsageRow[], field: "model" | "project" | "source" | "provider"): Slice[] {
  const map = new Map<string, Slice>();
  for (const r of rows) {
    const name = r[field];
    let s = map.get(name);
    if (!s) { s = { name, cost: 0, tokens: 0, requests: 0 }; map.set(name, s); }
    s.cost += r.cost;
    s.tokens += tokensOf(r);
    s.requests += r.requests;
  }
  return [...map.values()].sort((a, b) => b.cost - a.cost);
}

export const byModel = (rows: UsageRow[]) => breakdown(rows, "model");
export const byProject = (rows: UsageRow[]) => breakdown(rows, "project");
export const bySource = (rows: UsageRow[]) => breakdown(rows, "source");
export const byProvider = (rows: UsageRow[]) => breakdown(rows, "provider");

export interface ModelStat {
  model: string;
  sources: SourceId[];
  providers: string[];
  requests: number;
  errors: number;
  errorRate: number;
  tokens: number;
  cost: number;
  input: number;
  output: number;
  cacheCreate: number;
  cacheRead: number;
  reasoning: number;
  cacheHitRate: number; // cacheRead / (input + cacheRead)
  reasoningShare: number; // reasoning / output
  avgCost: number; // cost / requests
  tokensPerSec: number | null;
  avgDurationMs: number | null;
}

export function buildModelTable(rows: UsageRow[]): ModelStat[] {
  type Internal = ModelStat & { _durMs: number; _durN: number; _srcSet: Set<SourceId>; _provSet: Set<string> };
  const map = new Map<string, Internal>();
  for (const r of rows) {
    let m = map.get(r.model);
    if (!m) {
      m = {
        model: r.model, sources: [], providers: [], requests: 0, errors: 0, errorRate: 0,
        tokens: 0, cost: 0, input: 0, output: 0, cacheCreate: 0, cacheRead: 0, reasoning: 0,
        cacheHitRate: 0, reasoningShare: 0, avgCost: 0,
        tokensPerSec: null, avgDurationMs: null,
        _durMs: 0, _durN: 0, _srcSet: new Set(), _provSet: new Set(),
      };
      map.set(r.model, m);
    }
    m.requests += r.requests;
    m.errors += r.errors;
    m.tokens += tokensOf(r);
    m.cost += r.cost;
    m.input += r.input;
    m.output += r.output;
    m.cacheCreate += r.cacheCreate;
    m.cacheRead += r.cacheRead;
    m.reasoning += r.reasoning;
    m._durMs += r.durationMs;
    m._durN += r.durationCount;
    m._srcSet.add(r.source);
    m._provSet.add(r.provider);
  }
  const out: ModelStat[] = [];
  for (const m of map.values()) {
    m.sources = [...(m as Internal)._srcSet];
    m.providers = [...(m as Internal)._provSet];
    m.errorRate = m.requests > 0 ? m.errors / m.requests : 0;
    m.cacheHitRate = m.input + m.cacheRead > 0 ? m.cacheRead / (m.input + m.cacheRead) : 0;
    m.reasoningShare = m.output > 0 ? m.reasoning / m.output : 0;
    m.avgCost = m.requests > 0 ? m.cost / m.requests : 0;
    if ((m as Internal)._durN > 0) {
      m.avgDurationMs = (m as Internal)._durMs / (m as Internal)._durN;
      const secs = (m as Internal)._durMs / 1000;
      m.tokensPerSec = secs > 0 ? m.output / secs : null;
    }
    out.push(m);
  }
  return out.sort((a, b) => b.cost - a.cost);
}

/** Stacked model-mix series over time (top-N models by metric + "Other"). */
export function buildModelMix(
  rows: UsageRow[],
  g: Granularity,
  metric: Metric,
  topN = 6,
): { data: Array<Record<string, number | string>>; models: string[] } {
  const modelTotals = byModel(rows);
  const top = modelTotals.slice(0, topN).map((s) => s.name);
  const topSet = new Set(top);
  const hasOther = modelTotals.length > topN;

  const buckets = buildBuckets(rows, g);
  const idx = new Map(buckets.map((b, i) => [b.key, i]));
  const data: Array<Record<string, number | string>> = buckets.map((b) => {
    const row: Record<string, number | string> = { label: b.label };
    for (const m of top) row[m] = 0;
    if (hasOther) row["Other"] = 0;
    return row;
  });
  for (const r of rows) {
    const i = idx.get(bucketKey(r.date, g));
    if (i === undefined) continue;
    const v = metric === "cost" ? r.cost : tokensOf(r);
    const key = topSet.has(r.model) ? r.model : hasOther ? "Other" : null;
    if (key === null) continue;
    data[i][key] = ((data[i][key] as number) ?? 0) + v;
  }
  return { data, models: hasOther ? [...top, "Other"] : top };
}

export interface ProviderStat {
  provider: string;
  sources: SourceId[];
  models: string[];
  requests: number;
  errors: number;
  errorRate: number;
  tokens: number;
  cost: number;
  input: number;
  output: number;
  cacheCreate: number;
  cacheRead: number;
  cacheHitRate: number;
  avgCost: number;
  tokensPerSec: number | null;
  avgDurationMs: number | null;
}

export function buildProviderTable(rows: UsageRow[]): ProviderStat[] {
  type Internal = ProviderStat & { _durMs: number; _durN: number; _srcSet: Set<SourceId>; _modelSet: Set<string> };
  const map = new Map<string, Internal>();
  for (const r of rows) {
    let p = map.get(r.provider);
    if (!p) {
      p = {
        provider: r.provider, sources: [], models: [],
        requests: 0, errors: 0, errorRate: 0,
        tokens: 0, cost: 0, input: 0, output: 0, cacheCreate: 0, cacheRead: 0,
        cacheHitRate: 0, avgCost: 0,
        tokensPerSec: null, avgDurationMs: null,
        _durMs: 0, _durN: 0, _srcSet: new Set(), _modelSet: new Set(),
      };
      map.set(r.provider, p);
    }
    p.requests += r.requests;
    p.errors += r.errors;
    p.tokens += tokensOf(r);
    p.cost += r.cost;
    p.input += r.input;
    p.output += r.output;
    p.cacheCreate += r.cacheCreate;
    p.cacheRead += r.cacheRead;
    p._durMs += r.durationMs;
    p._durN += r.durationCount;
    p._srcSet.add(r.source);
    p._modelSet.add(r.model);
  }
  const out: ProviderStat[] = [];
  for (const p of map.values()) {
    p.sources = [...(p as Internal)._srcSet];
    p.models = [...(p as Internal)._modelSet];
    p.errorRate = p.requests > 0 ? p.errors / p.requests : 0;
    p.cacheHitRate = p.input + p.cacheRead > 0 ? p.cacheRead / (p.input + p.cacheRead) : 0;
    p.avgCost = p.requests > 0 ? p.cost / p.requests : 0;
    if ((p as Internal)._durN > 0) {
      p.avgDurationMs = (p as Internal)._durMs / (p as Internal)._durN;
      const secs = (p as Internal)._durMs / 1000;
      p.tokensPerSec = secs > 0 ? p.output / secs : null;
    }
    out.push(p);
  }
  return out.sort((a, b) => b.cost - a.cost);
}

/** Stacked provider-mix series over time. */
export function buildProviderMix(
  rows: UsageRow[],
  g: Granularity,
  metric: Metric,
): { data: Array<Record<string, number | string>>; providers: string[] } {
  const provTotals = byProvider(rows);
  const providers = provTotals.map((s) => s.name);
  const buckets = buildBuckets(rows, g);
  const idx = new Map(buckets.map((b, i) => [b.key, i]));
  const data: Array<Record<string, number | string>> = buckets.map((b) => {
    const row: Record<string, number | string> = { label: b.label };
    for (const prov of providers) row[prov] = 0;
    return row;
  });
  for (const r of rows) {
    const i = idx.get(bucketKey(r.date, g));
    if (i === undefined) continue;
    const v = metric === "cost" ? r.cost : tokensOf(r);
    data[i][r.provider] = ((data[i][r.provider] as number) ?? 0) + v;
  }
  return { data, providers };
}

export interface Totals {
  cost: number;
  tokens: number;
  requests: number;
  errors: number;
  errorRate: number;
  input: number;
  output: number;
  cacheCreate: number;
  cacheRead: number;
  reasoning: number;
  costInput: number;
  costOutput: number;
  costCacheCreate: number;
  costCacheRead: number;
  projects: number;
  models: number;
  sources: number;
  cacheHitRate: number;
  reasoningShare: number;
  firstDate: string;
  lastDate: string;
}

export function totals(rows: UsageRow[]): Totals {
  const t: Totals = {
    cost: 0, tokens: 0, requests: 0, errors: 0, errorRate: 0,
    input: 0, output: 0, cacheCreate: 0, cacheRead: 0, reasoning: 0,
    costInput: 0, costOutput: 0, costCacheCreate: 0, costCacheRead: 0,
    projects: 0, models: 0, sources: 0,
    cacheHitRate: 0, reasoningShare: 0, firstDate: "", lastDate: "",
  };
  const projects = new Set<string>(), models = new Set<string>(), sources = new Set<string>();
  for (const r of rows) {
    t.cost += r.cost;
    t.requests += r.requests;
    t.errors += r.errors;
    t.input += r.input;
    t.output += r.output;
    t.cacheCreate += r.cacheCreate;
    t.cacheRead += r.cacheRead;
    t.reasoning += r.reasoning;
    t.costInput += r.costInput;
    t.costOutput += r.costOutput;
    t.costCacheCreate += r.costCacheCreate;
    t.costCacheRead += r.costCacheRead;
    projects.add(r.project);
    models.add(r.model);
    sources.add(r.source);
    if (!t.firstDate || r.date < t.firstDate) t.firstDate = r.date;
    if (!t.lastDate || r.date > t.lastDate) t.lastDate = r.date;
  }
  t.tokens = t.input + t.output + t.cacheCreate + t.cacheRead;
  t.projects = projects.size;
  t.models = models.size;
  t.sources = sources.size;
  t.errorRate = t.requests > 0 ? t.errors / t.requests : 0;
  t.cacheHitRate = t.input + t.cacheRead > 0 ? t.cacheRead / (t.input + t.cacheRead) : 0;
  t.reasoningShare = t.output > 0 ? t.reasoning / t.output : 0;
  return t;
}

/** 7×24 activity matrix (rows = weekday, cols = hour) for the active sources. */
export function activityMatrix(
  cells: ActivityCell[],
  active: Set<SourceId>,
  metric: Metric,
): { matrix: number[][]; max: number } {
  const matrix: number[][] = Array.from({ length: 7 }, () => new Array(24).fill(0));
  let max = 0;
  for (const c of cells) {
    if (!active.has(c.source)) continue;
    const v = metric === "cost" ? c.cost : c.tokens;
    matrix[c.dow][c.hour] += v;
    if (matrix[c.dow][c.hour] > max) max = matrix[c.dow][c.hour];
  }
  return { matrix, max };
}

export function filterRows(
  rows: UsageRow[],
  activeSources: Set<SourceId>,
  activeProviders: Set<string> | null = null,
  selectedModel: string | null = null,
): UsageRow[] {
  return rows.filter(
    (r) =>
      activeSources.has(r.source) &&
      (activeProviders === null || activeProviders.has(r.provider)) &&
      (selectedModel === null || r.model === selectedModel),
  );
}

const PLACEHOLDER = "__USAGE_DATA_PLACEHOLDER__";

export function loadReportData(): ReportData | null {
  const raw = (window as any).__USAGE_DATA__;
  if (!raw || raw === PLACEHOLDER) return null;
  try {
    return typeof raw === "string" ? (JSON.parse(raw) as ReportData) : raw;
  } catch {
    return null;
  }
}
