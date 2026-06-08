import type { SourceId, UsageEvent } from "../types.js";
import type { DebugLogger } from "../debug.js";
import { claudeAdapter } from "./claude.js";
import { codexAdapter } from "./codex.js";
import { opencodeAdapter } from "./opencode.js";
import { piAdapter } from "./pi.js";

export interface ParseOpts {
  dir: string;
  timezone: string;
  since?: string;
  until?: string;
  debug?: DebugLogger;
}

export interface ParseOutput {
  events: UsageEvent[];
  sessions: number;
  files: number;
}

export interface SourceAdapter {
  id: SourceId;
  label: string;
  defaultDir(): string;
  /** Whether this source appears to have any data on disk. */
  exists(dir: string): Promise<boolean>;
  parse(opts: ParseOpts): Promise<ParseOutput>;
}

export const ADAPTERS: SourceAdapter[] = [
  claudeAdapter,
  codexAdapter,
  opencodeAdapter,
  piAdapter,
];

export function adapterById(id: string): SourceAdapter | undefined {
  return ADAPTERS.find((a) => a.id === id);
}
