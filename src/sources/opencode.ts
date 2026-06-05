import { readFile, readdir, access } from "node:fs/promises";
import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { UsageEvent } from "../types.js";
import { localParts, projectLabel, canonicalizeModel, normalizeProvider } from "../util.js";
import type { SourceAdapter, ParseOpts, ParseOutput } from "./index.js";

/**
 * OpenCode-specific provider normalization. The raw `anthropic` providerID
 * appears in older sessions from before Azure Foundry was set up; since no
 * direct Anthropic account is configured, treat these as Azure alongside the
 * newer `azure-foundry` traffic.
 */
function normalizeOpenCodeProvider(raw: string | null | undefined): string {
  if (raw === "anthropic") return "Azure";
  return normalizeProvider(raw);
}

function defaultDir(): string {
  const xdg = process.env.XDG_DATA_HOME;
  const base = xdg ? xdg : join(homedir(), ".local", "share");
  return join(base, "opencode");
}

/** Locate the primary DB plus any channel DBs (opencode-beta.db, etc.). */
function dbPaths(dir: string): string[] {
  const out: string[] = [];
  const main = join(dir, "opencode.db");
  if (existsSync(main)) out.push(main);
  try {
    for (const f of readdirSync(dir)) {
      if (/^opencode-[A-Za-z0-9_-]+\.db$/.test(f)) out.push(join(dir, f));
    }
  } catch {
    // ignore
  }
  return out;
}

/** Turn a parsed message object (from DB blob or JSON file) into an event. */
function messageToEvent(
  o: any,
  sessionDir: Map<string, string>,
  opts: ParseOpts,
): UsageEvent | null {
  if (o?.role !== "assistant") return null;
  const tok = o.tokens;
  if (!tok) return null;
  const created = o.time?.created;
  if (!created) return null;

  const { date, hour, dow } = localParts(created, opts.timezone);
  if (opts.since && date < opts.since) return null;
  if (opts.until && date > opts.until) return null;

  const input = tok.input ?? 0;
  const output = tok.output ?? 0;
  const reasoning = tok.reasoning ?? 0;
  const cacheRead = tok.cache?.read ?? 0;
  const cacheCreate = tok.cache?.write ?? 0;
  if (input + output + reasoning + cacheRead + cacheCreate === 0) return null;

  const sid = o.sessionID ?? "";
  const cwd = o.path?.cwd ?? sessionDir.get(sid);
  const completed = o.time?.completed;
  const durationMs =
    completed && completed > created ? completed - created : undefined;

  return {
    ts: new Date(created).toISOString(),
    date, hour, dow,
    source: "opencode",
    provider: normalizeOpenCodeProvider(o.providerID),
    model: canonicalizeModel(o.modelID ?? "unknown"),
    project: projectLabel(cwd),
    input,
    output: output + reasoning, // billable output includes reasoning
    cacheCreate,
    cacheRead,
    reasoning,
    nativeCost: typeof o.cost === "number" ? o.cost : undefined,
    isError: o.finish === "error" || o.finish === "failed",
    durationMs,
  };
}

/** Build sessionId → working directory from the session table. */
function sessionDirMap(db: any): Map<string, string> {
  const map = new Map<string, string>();
  try {
    const rows = db.prepare("SELECT id, directory, path, data FROM session").all();
    for (const r of rows) {
      let dir: string | undefined = r.directory || r.path || undefined;
      if (!dir && r.data) {
        try {
          const d = JSON.parse(r.data);
          dir = d.directory ?? d.path?.cwd ?? d.path?.root;
        } catch {
          /* ignore */
        }
      }
      if (dir) map.set(r.id, dir);
    }
  } catch {
    // session table shape differs; project attribution falls back to cwd in msg
  }
  return map;
}

async function listJsonMessageFiles(dir: string): Promise<string[]> {
  const msgDir = join(dir, "storage", "message");
  let sessionDirs;
  try {
    sessionDirs = await readdir(msgDir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const s of sessionDirs) {
    if (!s.isDirectory()) continue;
    try {
      for (const f of await readdir(join(msgDir, s.name))) {
        if (f.endsWith(".json")) out.push(join(msgDir, s.name, f));
      }
    } catch {
      /* ignore */
    }
  }
  return out;
}

export const opencodeAdapter: SourceAdapter = {
  id: "opencode",
  label: "OpenCode",
  defaultDir,

  async exists(dir) {
    try {
      await access(dir);
      return true;
    } catch {
      return false;
    }
  },

  async parse(opts: ParseOpts): Promise<ParseOutput> {
    const events: UsageEvent[] = [];
    const seen = new Set<string>();
    const sessions = new Set<string>();
    let files = 0;

    // 1) Read from the SQLite database(s) first — this is where the bulk lives.
    let Database: any;
    try {
      ({ default: Database } = await import("better-sqlite3"));
    } catch {
      Database = null;
    }
    if (Database) {
      for (const dbPath of dbPaths(opts.dir)) {
        files++;
        let db: any;
        try {
          db = new Database(dbPath, { readonly: true, fileMustExist: true });
          db.pragma("busy_timeout = 3000");
        } catch {
          continue;
        }
        try {
          const dirMap = sessionDirMap(db);
          const stmt = db.prepare("SELECT id, session_id, data FROM message");
          for (const row of stmt.iterate()) {
            let o: any;
            try {
              o = JSON.parse(row.data);
            } catch {
              continue;
            }
            if (row.session_id) o.sessionID = row.session_id;
            const ev = messageToEvent(o, dirMap, opts);
            if (!ev) continue;
            const key = row.id ? `id:${row.id}` : `db:${dbPath}:${ev.ts}:${ev.model}`;
            if (seen.has(key)) continue;
            seen.add(key);
            if (row.session_id) sessions.add(row.session_id);
            events.push(ev);
          }
        } catch {
          // query failed; skip this db
        } finally {
          try {
            db.close();
          } catch {
            /* ignore */
          }
        }
      }
    }

    // 2) Supplement with JSON message files (DB wins on duplicate ids).
    const jsonFiles = await listJsonMessageFiles(opts.dir);
    for (const file of jsonFiles) {
      files++;
      let o: any;
      try {
        o = JSON.parse(await readFile(file, "utf8"));
      } catch {
        continue;
      }
      const ev = messageToEvent(o, new Map(), opts);
      if (!ev) continue;
      const key = o.id ? `id:${o.id}` : `file:${file}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (o.sessionID) sessions.add(o.sessionID);
      events.push(ev);
    }

    return { events, sessions: sessions.size, files };
  },
};
