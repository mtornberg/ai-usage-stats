import { readFile, readdir, access } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { UsageEvent } from "../types.js";
import { localParts, projectLabel, canonicalizeModel, normalizeProvider } from "../util.js";
import type { SourceAdapter, ParseOpts, ParseOutput } from "./index.js";

async function findJsonl(dir: string): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await findJsonl(full)));
    else if (e.isFile() && e.name.endsWith(".jsonl")) out.push(full);
  }
  return out;
}

/** Parse a usage sub-object accepting all field-name aliases ccusage supports. */
function parseUsage(u: any): { input: number; cached: number; output: number; reasoning: number } | null {
  if (!u || typeof u !== "object") return null;
  const input = u.input_tokens ?? u.prompt_tokens ?? u.input ?? 0;
  const output = u.output_tokens ?? u.completion_tokens ?? u.output ?? 0;
  const cached = u.cached_input_tokens ?? u.cache_read_input_tokens ?? u.cached_tokens ?? 0;
  const reasoning = u.reasoning_output_tokens ?? u.reasoning_tokens ?? 0;
  if (input + output + cached + reasoning === 0) return null;
  return { input, cached: Math.min(cached, input), output, reasoning };
}

/** Extract a timestamp from various positions; returns ISO string or null. */
function extractTs(obj: any): string | null {
  const candidates = [
    obj.timestamp, obj.created_at, obj.createdAt,
    obj.data?.timestamp, obj.data?.created_at, obj.data?.createdAt,
    obj.result?.timestamp, obj.result?.created_at, obj.result?.createdAt,
    obj.response?.timestamp, obj.response?.created_at, obj.response?.createdAt,
  ];
  for (const v of candidates) {
    if (!v) continue;
    if (typeof v === "string") return v;
    if (typeof v === "number") {
      const ms = v > 10_000_000_000 ? v : v * 1000;
      return new Date(ms).toISOString();
    }
  }
  return null;
}

/** Extract model string from various positions. */
function extractModel(obj: any): string | undefined {
  const sub = [obj, obj.data, obj.result, obj.response];
  for (const s of sub) {
    if (!s) continue;
    const m = s.model ?? s.model_name ?? s.metadata?.model;
    if (m && typeof m === "string") return m;
  }
  return undefined;
}

/** Extract usage from various positions (headless/exec format). */
function extractHeadlessUsage(obj: any) {
  const subs = [obj, obj.data, obj.result, obj.response];
  for (const s of subs) {
    const u = parseUsage(s?.usage);
    if (u) return u;
  }
  return null;
}

/** Classify a parsed line: 'session' | 'headless' | null */
function lineKind(obj: any): "session" | "headless" | null {
  if (!obj || typeof obj !== "object") return null;
  if (obj.type === "turn_context") return "session";
  if (obj.type === "session_meta") return "session";
  if (obj.type === "event_msg") {
    const p = obj.payload ?? {};
    if (p.type === "token_count") return "session";
  }
  // Headless: must have usage somewhere and NOT be a session-type line
  const raw = JSON.stringify(obj);
  if (/"usage"|"input_tokens"|"prompt_tokens"/.test(raw)) return "headless";
  return null;
}

export const codexAdapter: SourceAdapter = {
  id: "codex",
  label: "Codex",
  defaultDir: () => join(homedir(), ".codex", "sessions"),

  async exists(dir) {
    try { await access(dir); return true; } catch { return false; }
  },

  async parse(opts: ParseOpts): Promise<ParseOutput> {
    const files = await findJsonl(opts.dir);
    const events: UsageEvent[] = [];
    // Cross-session dedup for headless events (same key = same event replayed
    // across a forked session file — ccusage dedupes on (ts,model,tokens) tuple)
    const headlessSeen = new Set<string>();
    let sessions = 0;

    for (const file of files) {
      let content: string;
      try { content = await readFile(file, "utf8"); } catch { continue; }
      sessions++;

      let curModel = "gpt-5-codex";
      let curProvider = "OpenAI"; // updated from session_meta
      let curCwd: string | undefined;
      let prevTotal = 0;

      for (const line of content.split("\n")) {
        if (!line.trim()) continue;
        let obj: any;
        try { obj = JSON.parse(line); } catch { continue; }

        const kind = lineKind(obj);
        if (!kind) continue;

        // ── Session-format lines ────────────────────────────────────────────
        if (kind === "session") {
          const p = obj.payload ?? {};
          if (obj.type === "session_meta") {
            curCwd = p.cwd ?? curCwd;
            if (p.model_provider) curProvider = normalizeProvider(p.model_provider);
            continue;
          }
          if (obj.type === "turn_context") {
            if (p.cwd) curCwd = p.cwd;
            const m = p.model ?? p.model_name ?? p.metadata?.model;
            if (m) curModel = m;
            continue;
          }
          // event_msg / token_count
          const info = p.info;
          if (!info) continue;

          let u: ReturnType<typeof parseUsage>;
          if (info.last_token_usage) {
            u = parseUsage(info.last_token_usage);
          } else if (info.total_token_usage) {
            // Cumulative: subtract what we've already counted.
            const total = info.total_token_usage;
            const curTotal = total.total_tokens ?? 0;
            if (curTotal <= prevTotal) continue;
            // Build a synthetic delta entry from the running total
            const raw = { ...total };
            raw.total_tokens = curTotal - prevTotal;
            raw.output_tokens = (total.output_tokens ?? 0) - /* previous out was absorbed */ 0;
            // Fall back to treating this token_count as cumulative-delta
            u = parseUsage(info.total_token_usage);
            prevTotal = curTotal;
          } else continue;

          if (!u) continue;
          // Model from info if present, else carry forward curModel
          const model = info.model ?? info.model_name ?? info.metadata?.model ?? curModel;
          const ts = obj.timestamp ?? "";
          if (!ts) continue;
          const { date, hour, dow } = localParts(ts, opts.timezone);
          if (opts.since && date < opts.since) continue;
          if (opts.until && date > opts.until) continue;

          events.push({
            ts, date, hour, dow,
            source: "codex",
            provider: curProvider,
            model: canonicalizeModel(model),
            project: projectLabel(curCwd, file),
            input: Math.max(0, u.input - u.cached),
            output: u.output,
            cacheCreate: 0,
            cacheRead: u.cached,
            reasoning: u.reasoning,
          });
          continue;
        }

        // ── Headless/exec-format lines ─────────────────────────────────────
        const u = extractHeadlessUsage(obj);
        if (!u) continue;
        const ts = extractTs(obj);
        if (!ts) continue;
        const { date, hour, dow } = localParts(ts, opts.timezone);
        if (opts.since && date < opts.since) continue;
        if (opts.until && date > opts.until) continue;
        const model = canonicalizeModel(extractModel(obj) ?? curModel);

        // Dedup key: (ts, model, input, cached, output, reasoning)
        const dk = `${ts}|${model}|${u.input}|${u.cached}|${u.output}|${u.reasoning}`;
        if (headlessSeen.has(dk)) continue;
        headlessSeen.add(dk);

        events.push({
          ts, date, hour, dow,
          source: "codex",
          provider: curProvider,
          model,
          project: projectLabel(curCwd, file),
          input: Math.max(0, u.input - u.cached),
          output: u.output,
          cacheCreate: 0,
          cacheRead: u.cached,
          reasoning: u.reasoning,
        });
      }
    }

    return { events, sessions, files: files.length };
  },
};
