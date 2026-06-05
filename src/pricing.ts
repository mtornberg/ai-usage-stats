import { readFile, writeFile, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const LITELLM_URL =
  "https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json";

const CACHE_TTL_MS = 1000 * 60 * 60 * 24; // 24h

export interface ModelPrice {
  input_cost_per_token?: number;
  output_cost_per_token?: number;
  cache_creation_input_token_cost?: number;
  cache_read_input_token_cost?: number;
  // Tiered pricing: higher rate for tokens above 200k per request (per LiteLLM)
  input_cost_per_token_above_200k_tokens?: number;
  output_cost_per_token_above_200k_tokens?: number;
  cache_creation_input_token_cost_above_200k_tokens?: number;
  cache_read_input_token_cost_above_200k_tokens?: number;
}

export type PriceTable = Record<string, ModelPrice>;
export type PricingSource = "live" | "cache" | "fallback";

function cachePath(): string {
  return join(homedir(), ".cache", "ai-usage-stats", "pricing.json");
}

function fallbackPath(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, "pricing-fallback.json");
}

async function readJson<T>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch {
    return null;
  }
}

interface LoadedPricing {
  table: PriceTable;
  source: PricingSource;
}

/**
 * Load model pricing. Prefers a fresh fetch from LiteLLM, falls back to a
 * recent on-disk cache, then to the pricing table bundled with the tool.
 */
export async function loadPricing(
  offline = false,
): Promise<LoadedPricing> {
  const cache = await readJson<{ at: number; table: PriceTable }>(cachePath());

  if (!offline) {
    // Use cache if it's fresh enough to avoid hammering the network.
    if (cache && Date.now() - cache.at < CACHE_TTL_MS) {
      return { table: cache.table, source: "cache" };
    }
    try {
      const res = await fetch(LITELLM_URL, {
        signal: AbortSignal.timeout(15000),
      });
      if (res.ok) {
        const table = (await res.json()) as PriceTable;
        try {
          await mkdir(dirname(cachePath()), { recursive: true });
          await writeFile(
            cachePath(),
            JSON.stringify({ at: Date.now(), table }),
          );
        } catch {
          // Cache write is best-effort.
        }
        return { table, source: "live" };
      }
    } catch {
      // Network failed; fall through to cache/fallback.
    }
  }

  if (cache?.table) return { table: cache.table, source: "cache" };

  const fallback = await readJson<PriceTable>(fallbackPath());
  return { table: fallback ?? {}, source: "fallback" };
}

const REGION_PREFIX = /^(us|eu|global|au|apac|jp|sa|me|ca)\./;
const PROVIDER_PREFIX =
  /^(anthropic|bedrock|vertex_ai|vertex|openrouter|claude-code|azure|chatgpt|github_copilot|openai)\./;
const SLASH_PREFIX = /^[a-z0-9_-]+\//;

function normalizeKey(key: string): string {
  let k = key;
  k = k.replace(REGION_PREFIX, "");
  k = k.replace(PROVIDER_PREFIX, "");
  k = k.replace(SLASH_PREFIX, "");
  return k;
}

/** Build a resolver that maps a log model name to its pricing entry. */
export function makeResolver(table: PriceTable) {
  const norm = new Map<string, { key: string; price: ModelPrice }>();
  for (const [key, price] of Object.entries(table)) {
    if (!price || typeof price !== "object") continue;
    if (price.input_cost_per_token === undefined) continue;
    const n = normalizeKey(key);
    const existing = norm.get(n);
    if (!existing || key.length < existing.key.length) {
      norm.set(n, { key, price });
    }
  }

  return function resolve(model: string): ModelPrice | null {
    if (table[model]?.input_cost_per_token !== undefined) return table[model];
    const tail = model.includes("/") ? model.split("/").pop()! : model;
    if (tail !== model && table[tail]?.input_cost_per_token !== undefined)
      return table[tail];
    const hit =
      norm.get(normalizeKey(model)) ?? norm.get(model) ?? norm.get(tail);
    return hit ? hit.price : null;
  };
}

const TIER_THRESHOLD = 200_000;

/**
 * Tiered per-token cost: the first 200k tokens bill at `base`, tokens above
 * that at `above` (if defined). Matches ccusage/LiteLLM behaviour exactly.
 */
function tieredCost(tokens: number, base: number, above: number | undefined): number {
  if (tokens <= 0) return 0;
  if (above !== undefined && tokens > TIER_THRESHOLD) {
    return TIER_THRESHOLD * base + (tokens - TIER_THRESHOLD) * above;
  }
  return tokens * base;
}

export interface Tokens {
  input: number;
  output: number;
  cacheCreate: number;
  cacheRead: number;
}

export interface CostBreakdown {
  input: number;
  output: number;
  cacheCreate: number;
  cacheRead: number;
  total: number;
  /** True when no pricing entry matched the model. */
  unknown: boolean;
}

/** Compute USD cost components for a token bundle given a model's price entry. */
export function costOf(tokens: Tokens, price: ModelPrice | null): CostBreakdown {
  if (!price) {
    return { input: 0, output: 0, cacheCreate: 0, cacheRead: 0, total: 0, unknown: true };
  }
  const inBase = price.input_cost_per_token ?? 0;
  const outBase = price.output_cost_per_token ?? 0;
  // LiteLLM omits cache rates for models without prompt caching; fall back to
  // input rate (creation = 1.25× input, read = 0.1× input) matching ccusage defaults.
  const createBase = price.cache_creation_input_token_cost ?? inBase * 1.25;
  const readBase = price.cache_read_input_token_cost ?? inBase * 0.1;

  const input = tieredCost(tokens.input, inBase, price.input_cost_per_token_above_200k_tokens);
  const output = tieredCost(tokens.output, outBase, price.output_cost_per_token_above_200k_tokens);
  const cacheCreate = tieredCost(tokens.cacheCreate, createBase, price.cache_creation_input_token_cost_above_200k_tokens);
  const cacheRead = tieredCost(tokens.cacheRead, readBase, price.cache_read_input_token_cost_above_200k_tokens);

  return { input, output, cacheCreate, cacheRead, total: input + output + cacheCreate + cacheRead, unknown: false };
}
