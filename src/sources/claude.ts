import { readFile, readdir, access } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { UsageEvent } from "../types.js";
import { localParts, projectLabel, canonicalizeModel } from "../util.js";
import type { SourceAdapter, ParseOpts, ParseOutput } from "./index.js";

function defaultProjectsDir(): string {
  return join(homedir(), ".claude", "projects");
}

/**
 * All Claude `projects` dirs to scan, mirroring ccusage: CLAUDE_CONFIG_DIR
 * (comma-separated) if set, else both ~/.config/claude and ~/.claude.
 */
function claudeDirs(primary: string): string[] {
  if (primary !== defaultProjectsDir()) return [primary];
  const dirs = new Set<string>();
  const env = process.env.CLAUDE_CONFIG_DIR;
  if (env) {
    for (const base of env.split(",").map((s) => s.trim()).filter(Boolean)) {
      dirs.add(base.endsWith("projects") ? base : join(base, "projects"));
    }
    return [...dirs];
  }
  const xdg = process.env.XDG_CONFIG_HOME || join(homedir(), ".config");
  dirs.add(join(xdg, "claude", "projects"));
  dirs.add(defaultProjectsDir());
  return [...dirs];
}

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

function totalTokens(usage: any): number {
  return (
    (usage?.input_tokens ?? 0) +
    (usage?.output_tokens ?? 0) +
    (usage?.cache_creation_input_tokens ?? 0) +
    (usage?.cache_read_input_tokens ?? 0)
  );
}

interface Candidate {
  event: UsageEvent;
  isSidechain: boolean;
  tokenTotal: number;
  hasSpeed: boolean;
  nativeCost?: number;
}

/** ccusage dedup resolution: non-sidechain > more tokens > has speed. */
function shouldReplace(existing: Candidate, incoming: Candidate): boolean {
  if (existing.isSidechain !== incoming.isSidechain) {
    return existing.isSidechain; // prefer non-sidechain
  }
  if (incoming.tokenTotal !== existing.tokenTotal) {
    return incoming.tokenTotal > existing.tokenTotal;
  }
  return incoming.hasSpeed && !existing.hasSpeed;
}

export const claudeAdapter: SourceAdapter = {
  id: "claude-code",
  label: "Claude Code",
  defaultDir: defaultProjectsDir,

  async exists(dir) {
    try { await access(dir); return true; } catch { return false; }
  },

  async parse(opts: ParseOpts): Promise<ParseOutput> {
    const fileSet = new Set<string>();
    for (const dir of claudeDirs(opts.dir)) {
      for (const f of await findJsonl(dir)) fileSet.add(f);
    }
    const files = [...fileSet];
    // dedup map: (message.id | requestId) → best candidate seen so far
    const dedupMap = new Map<string, Candidate>();
    // secondary index: message.id alone (catches sidechain replay with new requestId)
    const byMsgId = new Map<string, string>(); // msgId → dedupKey
    const sessions = new Set<string>();

    for (const file of files) {
      let content: string;
      try { content = await readFile(file, "utf8"); } catch { continue; }

      for (const line of content.split("\n")) {
        if (!line.trim()) continue;
        let obj: any;
        try { obj = JSON.parse(line); } catch { continue; }
        if (obj?.type !== "assistant") continue;
        const msg = obj.message;
        const usage = msg?.usage;
        if (!usage) continue;
        const model: string = msg.model ?? "";
        if (!model || model.startsWith("<")) continue;
        if (!obj.timestamp) continue;

        const { date, hour, dow } = localParts(obj.timestamp, opts.timezone);
        if (opts.since && date < opts.since) continue;
        if (opts.until && date > opts.until) continue;
        if (obj.sessionId) sessions.add(obj.sessionId);

        const msgId: string = msg.id ?? "";
        const reqId: string = obj.requestId ?? "";
        if (!msgId && !reqId) {
          // No dedup key — emit directly.
          const ev: UsageEvent = {
            ts: obj.timestamp, date, hour, dow,
            source: "claude-code",
            provider: "Anthropic",
            model: canonicalizeModel(model),
            project: projectLabel(obj.cwd, file),
            input: usage.input_tokens ?? 0,
            output: usage.output_tokens ?? 0,
            cacheCreate: usage.cache_creation_input_tokens ?? 0,
            cacheRead: usage.cache_read_input_tokens ?? 0,
            reasoning: 0,
            nativeCost: typeof obj.costUSD === "number" ? obj.costUSD : undefined,
          };
          dedupMap.set(`direct:${obj.timestamp}:${model}:${Math.random()}`, {
            event: ev, isSidechain: false, tokenTotal: totalTokens(usage), hasSpeed: false,
          });
          continue;
        }

        const dedupKey = `${msgId}|${reqId}`;
        const isSidechain = Boolean(obj.isSidechain);
        const tokTotal = totalTokens(usage);
        const hasSpeed = Boolean(msg.usage?.speed);

        const ev: UsageEvent = {
          ts: obj.timestamp, date, hour, dow,
          source: "claude-code",
          provider: "Anthropic",
          model: canonicalizeModel(model),
          project: projectLabel(obj.cwd, file),
          input: usage.input_tokens ?? 0,
          output: usage.output_tokens ?? 0,
          cacheCreate: usage.cache_creation_input_tokens ?? 0,
          cacheRead: usage.cache_read_input_tokens ?? 0,
          reasoning: 0,
          nativeCost: typeof obj.costUSD === "number" ? obj.costUSD : undefined,
          isError: msg.stop_reason === "error",
        };
        const incoming: Candidate = { event: ev, isSidechain, tokenTotal: tokTotal, hasSpeed };

        // Check if a sidechain replay shares the same message.id with a different requestId
        const existingKeyForMsgId = msgId ? byMsgId.get(msgId) : undefined;
        const existingByMsgId = existingKeyForMsgId ? dedupMap.get(existingKeyForMsgId) : undefined;

        if (existingByMsgId && existingKeyForMsgId !== dedupKey) {
          // Different requestId but same message.id → sidechain replay; prefer non-sidechain
          if (shouldReplace(existingByMsgId, incoming)) {
            dedupMap.delete(existingKeyForMsgId!);
            dedupMap.set(dedupKey, incoming);
            if (msgId) byMsgId.set(msgId, dedupKey);
          }
          continue;
        }

        const existing = dedupMap.get(dedupKey);
        if (existing) {
          if (shouldReplace(existing, incoming)) {
            dedupMap.set(dedupKey, incoming);
          }
        } else {
          dedupMap.set(dedupKey, incoming);
          if (msgId) byMsgId.set(msgId, dedupKey);
        }
      }
    }

    const events = [...dedupMap.values()].map((c) => c.event);
    return { events, sessions: sessions.size, files: files.length };
  },
};
