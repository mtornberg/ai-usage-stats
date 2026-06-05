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

export const piAdapter: SourceAdapter = {
  id: "pi",
  label: "Pi (oh-my-pi)",
  defaultDir: () => join(homedir(), ".pi", "agent", "sessions"),

  async exists(dir) {
    try { await access(dir); return true; } catch { return false; }
  },

  async parse(opts: ParseOpts): Promise<ParseOutput> {
    const files = await findJsonl(opts.dir);
    const seen = new Set<string>();
    const sessions = new Set<string>();
    const events: UsageEvent[] = [];

    for (const file of files) {
      let content: string;
      try { content = await readFile(file, "utf8"); } catch { continue; }

      for (const line of content.split("\n")) {
        if (!line.trim()) continue;
        let obj: any;
        try { obj = JSON.parse(line); } catch { continue; }
        // Pi format: { type: "message", id, timestamp, message: { role, model, usage, ... } }
        if (obj?.type !== "message") continue;
        const msg = obj.message;
        if (msg?.role !== "assistant") continue;
        const usage = msg.usage;
        if (!usage) continue;
        if (!obj.timestamp) continue;

        const { date, hour, dow } = localParts(obj.timestamp, opts.timezone);
        if (opts.since && date < opts.since) continue;
        if (opts.until && date > opts.until) continue;

        const id: string | undefined = obj.id;
        if (id) {
          if (seen.has(id)) continue;
          seen.add(id);
        }
        if (obj.sessionId) sessions.add(obj.sessionId);

        // usage.{input, output, cacheRead, cacheWrite, totalTokens}
        // usage.cost.{total} is native USD cost
        const input = usage.input ?? 0;
        const output = usage.output ?? 0;
        const cacheRead = usage.cacheRead ?? 0;
        const cacheCreate = usage.cacheWrite ?? 0;
        const nativeCost: number | undefined =
          typeof usage.cost?.total === "number" ? usage.cost.total : undefined;

        events.push({
          ts: obj.timestamp,
          date, hour, dow,
          source: "pi",
          provider: normalizeProvider(msg.provider ?? msg.api),
          model: canonicalizeModel(msg.model ?? "unknown"),
          project: projectLabel(msg.cwd ?? obj.cwd, file),
          input,
          output,
          cacheCreate,
          cacheRead,
          reasoning: 0,
          nativeCost,
        });
      }
    }
    return { events, sessions: sessions.size, files: files.length };
  },
};
