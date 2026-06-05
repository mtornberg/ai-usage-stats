// Shape of the data embedded into the generated HTML report.
// The viewer (viewer/src/data.ts) mirrors these types.

export type SourceId = "claude-code" | "codex" | "opencode" | "pi";

/** A single normalized assistant usage event before aggregation. */
export interface UsageEvent {
  ts: string; // ISO timestamp
  date: string; // local YYYY-MM-DD
  hour: number; // 0-23 local
  dow: number; // 0=Sun .. 6=Sat local
  source: SourceId;
  /** Normalized provider name, e.g. "Anthropic", "GitHub Copilot", "Azure". */
  provider: string;
  model: string;
  project: string;
  input: number; // non-cached prompt tokens
  output: number; // completion tokens (incl. reasoning)
  cacheCreate: number; // cache write tokens
  cacheRead: number; // cache read tokens
  reasoning: number; // reasoning tokens (subset of output)
  /** Native cost from the source, when it provides one (else undefined). */
  nativeCost?: number;
  /** Whether this was a failed / error response. */
  isError?: boolean;
  /** Wall-clock duration of the response in ms, when available. */
  durationMs?: number;
}

/** Aggregated bucket: date × source × provider × model × project. */
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
  durationMs: number; // summed, only over rows with a duration
  durationCount: number; // how many events contributed a duration
}

/** Activity cell for the weekday × hour heatmap (aggregated over all dims). */
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
  currency: "USD";
  timezone: string;
  rows: UsageRow[];
  activity: ActivityCell[];
  sources: SourceSummary[];
  unknownModels: string[];
  eventCount: number;
}
