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

function errorMessage(err: unknown): string {
  return err instanceof Error ? `${err.name}: ${err.message}` : String(err);
}

type OpenedDb = { db: any; driver: "better-sqlite3" | "node:sqlite" };

async function importNodeSqlite(): Promise<any | null> {
  try {
    // Avoid a static typed import: this project targets @types/node 20, where
    // node:sqlite is not declared. It exists at runtime on Node 22+/24.
    const importer = Function("specifier", "return import(specifier)") as (specifier: string) => Promise<any>;
    return await importer("node:sqlite");
  } catch {
    return null;
  }
}

async function openDb(
  dbPath: string,
  Database: any,
  opts: ParseOpts,
): Promise<OpenedDb | null> {
  if (Database) {
    try {
      const db = new Database(dbPath, { readonly: true, fileMustExist: true });
      try {
        db.pragma?.("busy_timeout = 3000");
      } catch (err) {
        opts.debug?.logKV(`opencode.db.${dbPath}.better-sqlite3.busyTimeout`, `failure: ${errorMessage(err)}`);
      }
      opts.debug?.logKV(`opencode.db.${dbPath}.better-sqlite3.open`, "success");
      opts.debug?.logKV(`opencode.db.${dbPath}.driver`, "better-sqlite3");
      return { db, driver: "better-sqlite3" };
    } catch (err) {
      opts.debug?.logKV(`opencode.db.${dbPath}.better-sqlite3.open`, `failure: ${errorMessage(err)}`);
    }
  } else {
    opts.debug?.logKV(`opencode.db.${dbPath}.better-sqlite3.open`, "unavailable: import failed");
  }

  const nodeSqlite = await importNodeSqlite();
  if (!nodeSqlite?.DatabaseSync) {
    opts.debug?.logKV(`opencode.db.${dbPath}.node:sqlite.open`, "unavailable");
    return null;
  }
  try {
    const db = new nodeSqlite.DatabaseSync(dbPath, { readOnly: true });
    try {
      db.exec?.("PRAGMA busy_timeout = 3000");
    } catch (err) {
      opts.debug?.logKV(`opencode.db.${dbPath}.node:sqlite.busyTimeout`, `failure: ${errorMessage(err)}`);
    }
    opts.debug?.logKV(`opencode.db.${dbPath}.node:sqlite.open`, "success");
    opts.debug?.logKV(`opencode.db.${dbPath}.driver`, "node:sqlite");
    return { db, driver: "node:sqlite" };
  } catch (err) {
    opts.debug?.logKV(`opencode.db.${dbPath}.node:sqlite.open`, `failure: ${errorMessage(err)}`);
    return null;
  }
}

function statementRows(stmt: any): any[] {
  return stmt.all();
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

function sessionDirMapDebug(db: any): { map: Map<string, string>; rows: number; ok: boolean; error?: string } {
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
    return { map, rows: rows.length, ok: true };
  } catch (err) {
    return { map, rows: 0, ok: false, error: errorMessage(err) };
  }
}

async function listJsonMessageFiles(
  dir: string,
): Promise<{ files: string[]; ok: boolean; error?: string }> {
  const msgDir = join(dir, "storage", "message");
  let sessionDirs;
  try {
    sessionDirs = await readdir(msgDir, { withFileTypes: true });
  } catch (err) {
    return { files: [], ok: false, error: errorMessage(err) };
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
  return { files: out, ok: true };
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

    opts.debug?.logKV("opencode.resolvedDir", opts.dir);
    opts.debug?.logKV("opencode.dirExists", existsSync(opts.dir));

    // 1) Read from the SQLite database(s) first — this is where the bulk lives.
    let Database: any;
    try {
      ({ default: Database } = await import("better-sqlite3"));
      opts.debug?.log("opencode.better-sqlite3: import succeeded");
    } catch (err) {
      opts.debug?.logKV("opencode.better-sqlite3", `import failed: ${errorMessage(err)}`);
      Database = null;
    }
    const discoveredDbPaths = dbPaths(opts.dir);
    opts.debug?.logKV("opencode.dbPaths", discoveredDbPaths);
    for (const dbPath of discoveredDbPaths) {
      files++;
      const opened = await openDb(dbPath, Database, opts);
      if (!opened) continue;
      const db = opened.db;
      let dbRows = 0;
      let dbMessages = 0;
      let dbEvents = 0;
      try {
        const sessionDebug = opts.debug ? sessionDirMapDebug(db) : undefined;
        const dirMap = sessionDebug?.map ?? sessionDirMap(db);
        if (sessionDebug) {
          opts.debug?.logKV(`opencode.db.${dbPath}.sessionMap`, {
            ok: sessionDebug.ok,
            rows: sessionDebug.rows,
            mapped: sessionDebug.map.size,
            error: sessionDebug.error,
          });
        }
        const stmt = db.prepare("SELECT id, session_id, data FROM message");
        for (const row of statementRows(stmt)) {
          dbRows++;
          let o: any;
          try {
            o = JSON.parse(row.data);
            dbMessages++;
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
          dbEvents++;
        }
        opts.debug?.logKV(`opencode.db.${dbPath}.messageQuery`, "success");
      } catch (err) {
        opts.debug?.logKV(`opencode.db.${dbPath}.messageQuery`, `failure: ${errorMessage(err)}`);
        // query failed; skip this db
      } finally {
        opts.debug?.logKV(`opencode.db.${dbPath}.counts`, { rows: dbRows, messages: dbMessages, events: dbEvents });
        try {
          db.close();
        } catch {
          /* ignore */
        }
      }
    }

    // 2) Supplement with JSON message files (DB wins on duplicate ids).
    const jsonListing = await listJsonMessageFiles(opts.dir);
    const jsonFiles = jsonListing.files;
    opts.debug?.logKV(
      "opencode.jsonMessageDirRead",
      jsonListing.ok ? "success" : `failure: ${jsonListing.error}`,
    );
    opts.debug?.logKV("opencode.jsonFileCount", jsonFiles.length);
    let jsonParsed = 0;
    let jsonEvents = 0;
    for (const file of jsonFiles) {
      files++;
      let o: any;
      try {
        o = JSON.parse(await readFile(file, "utf8"));
        jsonParsed++;
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
      jsonEvents++;
    }
    opts.debug?.logKV("opencode.jsonCounts", { parsed: jsonParsed, events: jsonEvents });
    opts.debug?.logKV("opencode.parseSummary", { events: events.length, sessions: sessions.size, files });

    return { events, sessions: sessions.size, files };
  },
};
