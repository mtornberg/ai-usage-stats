import { writeFile } from "node:fs/promises";

export interface DebugLogger {
  readonly path: string;
  log(message: string): void;
  logKV(key: string, value: unknown): void;
  flush(): Promise<void>;
}

function formatValue(value: unknown): string {
  if (value instanceof Error) return `${value.name}: ${value.message}`;
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

export function createDebugLogger(path: string): DebugLogger {
  const lines: string[] = [];
  return {
    path,
    log(message: string) {
      lines.push(message);
    },
    logKV(key: string, value: unknown) {
      lines.push(`${key}: ${formatValue(value)}`);
    },
    async flush() {
      await writeFile(path, `${lines.join("\n")}\n`, "utf8");
    },
  };
}
