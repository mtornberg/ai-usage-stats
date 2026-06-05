# ai-usage-stats

Generate a **beautiful, self-contained HTML report** of your local AI coding-agent token usage and cost.
With a dashboard UI you can switch smoothly between **daily / weekly / monthly / yearly** breakdowns.

It reads session logs from multiple coding agents, computes cost from live
[LiteLLM](https://github.com/BerriAI/litellm) pricing (cached, with a bundled
fallback), and writes a single `.html` file you can open or share. No server,
works offline once generated.

### Supported sources

| Source | Where it reads | Notes |
| --- | --- | --- |
| **Claude Code** | `~/.claude/projects/**/*.jsonl` | input/output + cache-write/read tokens |
| **Codex** | `~/.codex/sessions/**/rollout-*.jsonl` | per-turn token deltas, reasoning tokens |
| **OpenCode** | `~/.local/share/opencode/storage/message/**/*.json` | native cost, reasoning, response duration |

Sources are auto-detected — only those present on disk are included.

## Dashboard

Four tabs, all sliceable by a global **source filter** and a **Cost / Tokens**
toggle:

- **Overview** — totals, spend/tokens over time (with cumulative line), by-tool
  donut, by-project bars, per-period table.
- **Models** — model share, **model-mix over time** (stacked area), and a
  **per-model statistics table** (requests, tokens, cost, $/req, cache-hit
  rate, reasoning share, tokens/s & avg duration where available).
- **Cost** — cost split by token type (input / output / cache-write /
  cache-read) as cards and a **stacked cost-composition chart** over time.
- **Activity** — a **weekday × hour heatmap** of when you use AI agents most.

## Quick start

```bash
npm install
npm run build          # build the viewer once (produces the HTML template)
npm run report -- --open
```

This writes `usage.html` in the current directory and opens it.

## Usage

```bash
# list supported sources and whether they were found on disk
npx ai-usage-stats sources

# default: all detected sources, writes ./usage.html
npx ai-usage-stats report

# only specific sources
npx ai-usage-stats report --source claude-code,codex

# custom output + open in browser
npx ai-usage-stats report -o ~/Desktop/usage.html --open

# limit the date range
npx ai-usage-stats report --since 2026-01-01 --until 2026-03-31

# don't hit the network for pricing (use cache / bundled table)
npx ai-usage-stats report --offline

# override where a source reads from
npx ai-usage-stats report --dir codex=/path/to/.codex/sessions
```

### Options

| Flag | Description | Default |
| --- | --- | --- |
| `-o, --out <file>` | Output HTML file | `usage.html` |
| `-s, --source <ids>` | Comma-separated sources (`claude-code,codex,opencode`) | all detected |
| `--dir <id=path>` | Override a source's logs dir (repeatable) | per-source default |
| `--since <date>` | Only usage on/after `YYYY-MM-DD` | — |
| `--until <date>` | Only usage on/before `YYYY-MM-DD` | — |
| `--offline` | Skip live pricing fetch | off |
| `--open` | Open the report when done | off |

## How it works

- **`src/sources/`** — one adapter per agent (`claude.ts`, `codex.ts`,
  `opencode.ts`), each normalizing its native log format into a common
  `UsageEvent`. Add a source by dropping in a new adapter and registering it.
- **`src/`** — the Node/TypeScript CLI: runs the selected adapters, resolves
  model pricing, aggregates to `date × source × model × project` rows (with cost
  split by token type) plus a weekday×hour activity matrix, and injects that
  JSON into the prebuilt viewer template.
- **`viewer/`** — a Vite + React + Tailwind dashboard, built into one
  self-contained HTML file via `vite-plugin-singlefile`. It re-buckets and
  re-slices the embedded rows (by period, source, model) on the fly, so every
  control is instant and works with no network.

## Development

```bash
npm run dev:viewer     # live-reloading dashboard with synthetic sample data
```

## Notes

- Costs are **estimates** derived from token counts × public model pricing.
  Cache-write and cache-read tokens are priced separately when the model has
  those rates.
- Pricing is fetched from LiteLLM and cached for 24h under
  `~/.cache/ai-usage-stats/pricing.json`; a bundled snapshot in
  `src/pricing-fallback.json` is used if offline.

## Inspiration

- **[ccusage](https://github.com/ryoppippi/ccusage)** — the original multi-agent
  token usage CLI that inspired this project's data model, source adapters, and
  pricing logic. Its Rust source was the reference for correct deduplication,
  cost calculation, and per-agent log formats.
- **[oh-my-pi](https://github.com/can1357/oh-my-pi)** — the AI coding agent
  whose stats dashboard (`@oh-my-pi/omp-stats`) informed the visualization
  design: model preference charts, per-model statistics tables, cost composition
  breakdowns, and the behavior analytics concept.

## License

[MIT](LICENSE) © 2026 Michael Törnberg
