#!/usr/bin/env node
import { resolve } from "node:path";
import { Command } from "commander";
import { loadPricing } from "./pricing.js";
import { aggregate } from "./aggregate.js";
import { writeReport } from "./report.js";
import { ADAPTERS, adapterById, type SourceAdapter } from "./sources/index.js";
import type { UsageEvent, SourceId } from "./types.js";

function fmtUSD(n: number): string {
  return "$" + n.toFixed(2);
}
function fmtTokens(n: number): string {
  if (n >= 1e9) return (n / 1e9).toFixed(2) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(2) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
  return String(n);
}

const program = new Command();

program
  .name("ai-usage-stats")
  .description(
    "Generate a beautiful self-contained HTML report of your local AI coding-agent token usage & cost (Claude Code, Codex, OpenCode).",
  )
  .version("0.2.0");

program
  .command("sources")
  .description("List supported sources and whether they were found on disk")
  .action(async () => {
    for (const a of ADAPTERS) {
      const dir = a.defaultDir();
      const found = await a.exists(dir);
      process.stdout.write(
        `${found ? "✓" : "·"} ${a.label.padEnd(12)} ${a.id.padEnd(12)} ${dir}\n`,
      );
    }
  });

program
  .command("report", { isDefault: true })
  .description("Parse agent session logs and write an HTML usage report")
  .option("-o, --out <file>", "output HTML file", "usage.html")
  .option(
    "-s, --source <ids>",
    "comma-separated sources to include (claude-code,codex,opencode)",
  )
  .option(
    "--dir <map>",
    "override a source's logs dir as id=path (repeatable)",
    collect,
    [] as string[],
  )
  .option("--since <date>", "only include usage on/after this date (YYYY-MM-DD)")
  .option("--until <date>", "only include usage on/before this date (YYYY-MM-DD)")
  .option("--offline", "skip the live pricing fetch; use cache/bundled prices")
  .option("--open", "open the report in your browser when done")
  .action(async (opts) => {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

    // Resolve which adapters to run.
    const wanted: Set<string> | null = opts.source
      ? new Set(String(opts.source).split(",").map((x) => x.trim()))
      : null;
    const dirOverrides = parseDirOverrides(opts.dir);

    const selected: SourceAdapter[] = [];
    for (const a of ADAPTERS) {
      if (wanted && !wanted.has(a.id)) continue;
      const dir = dirOverrides[a.id] ?? a.defaultDir();
      if (wanted || (await a.exists(dir))) selected.push(a);
    }
    if (selected.length === 0) {
      process.stderr.write(
        "✗ No sources selected or found. Try `ai-usage-stats sources`.\n",
      );
      process.exit(1);
    }

    const allEvents: UsageEvent[] = [];
    const sessionsBySource: Record<string, number> = {};
    for (const a of selected) {
      const dir = dirOverrides[a.id] ?? a.defaultDir();
      process.stderr.write(`▸ ${a.label}: reading ${dir}\n`);
      const out = await a.parse({
        dir,
        timezone,
        since: opts.since,
        until: opts.until,
      });
      sessionsBySource[a.id] = out.sessions;
      allEvents.push(...out.events);
      process.stderr.write(
        `  ${out.events.length} events · ${out.sessions} sessions · ${out.files} files\n`,
      );
    }

    if (allEvents.length === 0) {
      process.stderr.write(`✗ No usage events found.\n`);
      process.exit(1);
    }

    process.stderr.write(`▸ Loading model pricing…\n`);
    const { table, source } = await loadPricing(Boolean(opts.offline));
    process.stderr.write(`  pricing source: ${source}\n`);

    const data = aggregate(allEvents, table, {
      source,
      timezone,
      sessionsBySource,
    });

    if (data.unknownModels.length > 0) {
      process.stderr.write(
        `⚠ No pricing for: ${data.unknownModels.join(", ")} (used native cost where available)\n`,
      );
    }

    const total = data.rows.reduce((s, r) => s + r.cost, 0);
    const tokens = data.rows.reduce(
      (s, r) => s + r.input + r.output + r.cacheCreate + r.cacheRead,
      0,
    );

    const outPath = resolve(process.cwd(), opts.out);
    await writeReport(data, outPath);

    process.stderr.write(`\n✓ ${fmtUSD(total)} · ${fmtTokens(tokens)} tokens\n`);
    for (const s of data.sources) {
      process.stderr.write(
        `   ${s.label.padEnd(12)} ${fmtUSD(s.cost).padStart(9)} · ${fmtTokens(s.tokens).padStart(8)} · ${s.requests} req\n`,
      );
    }
    process.stderr.write(`✓ Wrote ${outPath}\n`);

    if (opts.open) {
      try {
        const { default: open } = await import("open");
        await open(outPath);
      } catch {
        process.stderr.write("  (could not auto-open; open it manually)\n");
      }
    }
  });

function collect(value: string, prev: string[]): string[] {
  return prev.concat([value]);
}

function parseDirOverrides(items: string[]): Partial<Record<SourceId, string>> {
  const out: Partial<Record<SourceId, string>> = {};
  for (const item of items) {
    const eq = item.indexOf("=");
    if (eq < 0) continue;
    const id = item.slice(0, eq).trim();
    const path = item.slice(eq + 1).trim();
    if (adapterById(id)) out[id as SourceId] = path;
  }
  return out;
}

program.parseAsync().catch((err) => {
  process.stderr.write(`✗ ${err?.message ?? err}\n`);
  process.exit(1);
});
