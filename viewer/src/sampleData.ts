import type { ReportData, UsageRow, ActivityCell, SourceId, SourceSummary } from "./data";
import { SOURCE_LABEL } from "./data";

// Deterministic synthetic data so `npm run dev` shows a populated dashboard.
function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

interface Spec {
  source: SourceId;
  models: string[];
  providers: string[];
  inRate: number;
  outRate: number;
  cacheReadRate: number;
}

function build(): ReportData {
  const rand = rng(7);
  const specs: Spec[] = [
    { source: "claude-code", models: ["claude-opus-4-8", "claude-sonnet-4-6", "claude-haiku-4-5"], providers: ["Anthropic"], inRate: 5e-6, outRate: 25e-6, cacheReadRate: 5e-7 },
    { source: "codex", models: ["gpt-5.3-codex", "gpt-5.2-codex"], providers: ["Azure", "OpenAI"], inRate: 1.75e-6, outRate: 14e-6, cacheReadRate: 1.75e-7 },
    { source: "opencode", models: ["claude-sonnet-4-6", "claude-opus-4-7", "gpt-5.3-codex"], providers: ["GitHub Copilot", "Amazon Bedrock", "Azure"], inRate: 3e-6, outRate: 15e-6, cacheReadRate: 3e-7 },
  ];
  const projects = ["ai-usage-stats", "rms/kp-rms", "code-kanban", "dev-container", "shipyard"];
  const rows: UsageRow[] = [];
  const activityMap = new Map<string, ActivityCell>();
  const srcSum = new Map<SourceId, SourceSummary>();
  const start = new Date("2026-03-08T00:00:00Z");

  for (let i = 0; i < 88; i++) {
    const d = new Date(start);
    d.setUTCDate(d.getUTCDate() + i);
    const date = d.toISOString().slice(0, 10);
    const dow = d.getUTCDay();
    if (rand() > 0.8) continue; // some idle days
    for (const spec of specs) {
      if (spec.source !== "claude-code" && rand() > 0.55) continue;
      const nRows = 1 + Math.floor(rand() * 3);
      for (let j = 0; j < nRows; j++) {
        const model = spec.models[Math.floor(rand() * (rand() > 0.25 ? 1 : spec.models.length))];
        const project = projects[Math.floor(rand() * projects.length)];
        const requests = 1 + Math.floor(rand() * 30);
        const input = Math.floor(rand() * 6000 * requests) + 200;
        const output = Math.floor(rand() * 1500 * requests) + 100;
        const reasoning = spec.source === "claude-code" ? 0 : Math.floor(output * rand() * 0.6);
        const cacheCreate = spec.source === "claude-code" ? Math.floor(rand() * 12000 * requests) : 0;
        const cacheRead = Math.floor(rand() * 80000 * requests);
        const costInput = input * spec.inRate;
        const costOutput = output * spec.outRate;
        const costCacheCreate = cacheCreate * spec.inRate * 1.25;
        const costCacheRead = cacheRead * spec.cacheReadRate;
        const cost = costInput + costOutput + costCacheCreate + costCacheRead;
        const durationCount = spec.source === "opencode" ? requests : 0;
        const durationMs = durationCount > 0 ? requests * (2000 + rand() * 8000) : 0;
        const provider = spec.providers[Math.floor(rand() * spec.providers.length)];
        rows.push({
          date, source: spec.source, provider, model, project, requests,
          errors: Math.random() < 0.02 ? 1 : 0,
          input, output, cacheCreate, cacheRead, reasoning,
          cost, costInput, costOutput, costCacheCreate, costCacheRead,
          durationMs, durationCount,
        });
        // activity
        const hour = Math.floor(8 + rand() * 11); // working hours-ish
        const aKey = `${dow} ${hour} ${spec.source}`;
        let cell = activityMap.get(aKey);
        if (!cell) { cell = { dow, hour, source: spec.source, cost: 0, tokens: 0, requests: 0 }; activityMap.set(aKey, cell); }
        const tok = input + output + cacheCreate + cacheRead;
        cell.cost += cost; cell.tokens += tok; cell.requests += requests;
        // source summary
        let s = srcSum.get(spec.source);
        if (!s) { s = { id: spec.source, label: SOURCE_LABEL[spec.source], requests: 0, tokens: 0, cost: 0, sessions: 0 }; srcSum.set(spec.source, s); }
        s.requests += requests; s.tokens += tok; s.cost += cost; s.sessions += 1;
      }
    }
  }

  return {
    generatedAt: new Date("2026-06-04T12:00:00Z").toISOString(),
    pricingSource: "fallback",
    currency: "USD",
    timezone: "UTC",
    rows,
    activity: [...activityMap.values()],
    sources: [...srcSum.values()].sort((a, b) => b.cost - a.cost),
    unknownModels: ["openai/gpt-oss-20b"],
    eventCount: rows.reduce((s, r) => s + r.requests, 0),
  };
}

export const sampleData: ReportData = build();
