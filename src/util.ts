import { basename, join } from "node:path";

export interface LocalParts {
  date: string; // YYYY-MM-DD
  hour: number; // 0-23
  dow: number; // 0=Sun..6=Sat
}

/** Break an ISO/epoch timestamp into local calendar parts for bucketing. */
export function localParts(ts: string | number, timezone: string): LocalParts {
  const d = typeof ts === "number" ? new Date(ts) : new Date(ts);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    weekday: "short",
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const date = `${get("year")}-${get("month")}-${get("day")}`;
  let hour = Number(get("hour"));
  if (hour === 24) hour = 0; // some engines emit 24 for midnight
  const dowMap: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  const dow = dowMap[get("weekday")] ?? 0;
  return { date, hour, dow };
}

const REGION_PREFIX = /^(us|eu|global|au|apac|jp|sa|me|ca)\./;
const PROVIDER_DOT_PREFIX =
  /^(anthropic|bedrock|amazon-bedrock|vertex_ai|vertex|openrouter|azure|chatgpt|github_copilot|github-copilot|openai)\./;
const SLASH_PREFIX = /^[a-z0-9_-]+\//;

/**
 * Canonicalize a logged model name so the same underlying model groups (and
 * prices) identically regardless of how a given agent spelled it.
 * Strips provider/region prefixes and dedots Claude minor versions
 * (claude-sonnet-4.6 → claude-sonnet-4-6). Leaves e.g. gpt-5.2-codex intact.
 */
export function canonicalizeModel(model: string): string {
  let m = model.trim();
  m = m.replace(REGION_PREFIX, "");
  m = m.replace(PROVIDER_DOT_PREFIX, "");
  m = m.replace(SLASH_PREFIX, "");
  m = m.replace(/^(claude-(?:haiku|opus|sonnet)-\d+)\.(\d+)/, "$1-$2");
  return m || model;
}

/**
 * Normalize a raw providerID string into a tidy display name that groups
 * variants together (e.g. azure-foundry + azure-cognitive-services → "Azure").
 */
export function normalizeProvider(raw: string | undefined | null): string {
  if (!raw) return "Unknown";
  const r = raw.toLowerCase();
  if (r.startsWith("azure")) return "Azure";
  if (r === "github-copilot") return "GitHub Copilot";
  if (r === "amazon-bedrock" || r === "bedrock") return "Amazon Bedrock";
  if (r === "anthropic") return "Anthropic";
  if (r === "lmstudio" || r === "lm-studio") return "LM Studio";
  if (r === "openai") return "OpenAI";
  if (r === "opencode") return "OpenCode";
  if (r === "google" || r.startsWith("vertex") || r.startsWith("gemini")) return "Google";
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

/** Produce a readable project label from a working directory path. */
export function projectLabel(cwd: string | undefined, fallbackFile?: string): string {
  if (cwd && typeof cwd === "string") {
    const parts = cwd.split("/").filter(Boolean);
    if (parts.length === 0) return "unknown";
    // Worktrees nest the repo under a branch dir; include the parent for context.
    const wtIdx = parts.findIndex((p) => p === "worktrees" || p === "vibe-kanban");
    if (wtIdx >= 0 && wtIdx + 1 < parts.length) {
      return parts.slice(wtIdx + 1).slice(-2).join("/");
    }
    return parts[parts.length - 1];
  }
  if (fallbackFile) return basename(join(fallbackFile, ".."));
  return "unknown";
}
