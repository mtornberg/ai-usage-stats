import type {
  UsageEvent,
  UsageRow,
  ReportData,
  ActivityCell,
  SourceSummary,
  SourceId,
} from "./types.js";
import { makeResolver, costOf, type PriceTable } from "./pricing.js";
import { ADAPTERS } from "./sources/index.js";

interface AggMeta {
  source: ReportData["pricingSource"];
  timezone: string;
  sessionsBySource: Record<string, number>;
}

const SOURCE_LABEL: Record<SourceId, string> = {
  "claude-code": "Claude Code",
  codex: "Codex",
  opencode: "OpenCode",
  pi: "Pi (oh-my-pi)",
};

/**
 * Collapse normalized events into (date, source, provider, model, project) rows
 * with full cost components, plus a weekday×hour activity matrix. The viewer
 * re-buckets and re-slices these client-side.
 */
export function aggregate(
  events: UsageEvent[],
  table: PriceTable,
  meta: AggMeta,
): ReportData {
  const resolve = makeResolver(table);
  const byKey = new Map<string, UsageRow>();
  const activity = new Map<string, ActivityCell>();
  const srcAgg = new Map<SourceId, SourceSummary>();
  const unknown = new Set<string>();

  for (const e of events) {
    const price = resolve(e.model);
    const c = costOf(
      {
        input: e.input,
        output: e.output,
        cacheCreate: e.cacheCreate,
        cacheRead: e.cacheRead,
      },
      price,
    );

    // Auto cost mode: prefer native per-event cost when > 0
    let cost: number;
    let costIn = c.input, costOut = c.output, costCC = c.cacheCreate, costCR = c.cacheRead;
    if (e.nativeCost !== undefined && e.nativeCost > 0) {
      cost = e.nativeCost;
      if (c.total > 0) {
        const scale = e.nativeCost / c.total;
        costIn *= scale; costOut *= scale; costCC *= scale; costCR *= scale;
      } else {
        costIn = cost; costOut = 0; costCC = 0; costCR = 0;
      }
    } else if (c.unknown) {
      cost = e.nativeCost ?? 0;
      if (!e.nativeCost) unknown.add(e.model);
      costIn = 0; costOut = 0; costCC = 0; costCR = 0;
    } else {
      cost = c.total;
    }
    const tokens = e.input + e.output + e.cacheCreate + e.cacheRead;

    // date × source × provider × model × project row
    const key = `${e.date}\t${e.source}\t${e.provider}\t${e.model}\t${e.project}`;
    let row = byKey.get(key);
    if (!row) {
      row = {
        date: e.date,
        source: e.source,
        provider: e.provider,
        model: e.model,
        project: e.project,
        requests: 0,
        errors: 0,
        input: 0, output: 0, cacheCreate: 0, cacheRead: 0, reasoning: 0,
        cost: 0, costInput: 0, costOutput: 0, costCacheCreate: 0, costCacheRead: 0,
        durationMs: 0, durationCount: 0,
      };
      byKey.set(key, row);
    }
    row.requests += 1;
    if (e.isError) row.errors += 1;
    row.input += e.input;
    row.output += e.output;
    row.cacheCreate += e.cacheCreate;
    row.cacheRead += e.cacheRead;
    row.reasoning += e.reasoning;
    row.cost += cost;
    row.costInput += costIn;
    row.costOutput += costOut;
    row.costCacheCreate += costCC;
    row.costCacheRead += costCR;
    if (e.durationMs !== undefined) {
      row.durationMs += e.durationMs;
      row.durationCount += 1;
    }

    // activity matrix
    const aKey = `${e.dow} ${e.hour} ${e.source}`;
    let cell = activity.get(aKey);
    if (!cell) {
      cell = { dow: e.dow, hour: e.hour, source: e.source, cost: 0, tokens: 0, requests: 0 };
      activity.set(aKey, cell);
    }
    cell.cost += cost;
    cell.tokens += tokens;
    cell.requests += 1;

    // per-source summary
    let s = srcAgg.get(e.source);
    if (!s) {
      s = {
        id: e.source,
        label: SOURCE_LABEL[e.source] ?? e.source,
        requests: 0, tokens: 0, cost: 0,
        sessions: meta.sessionsBySource[e.source] ?? 0,
      };
      srcAgg.set(e.source, s);
    }
    s.requests += 1;
    s.tokens += tokens;
    s.cost += cost;
  }

  const rows = [...byKey.values()].sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
  );

  return {
    generatedAt: new Date().toISOString(),
    pricingSource: meta.source,
    currency: "USD",
    timezone: meta.timezone,
    rows,
    activity: [...activity.values()],
    sources: [...srcAgg.values()].sort((a, b) => b.cost - a.cost),
    unknownModels: [...unknown].sort(),
    eventCount: events.length,
  };
}

export { ADAPTERS };
