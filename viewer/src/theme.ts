// Accent palette used across charts and breakdowns.
export const PALETTE = [
  "#a78bfa", // violet
  "#22d3ee", // cyan
  "#f472b6", // pink
  "#34d399", // emerald
  "#fbbf24", // amber
  "#60a5fa", // blue
  "#fb7185", // rose
  "#a3e635", // lime
  "#c084fc", // purple
  "#2dd4bf", // teal
];

export function colorFor(index: number): string {
  return PALETTE[index % PALETTE.length];
}

export const ACCENT = "#a78bfa";
export const ACCENT_2 = "#22d3ee";

// Stable colors per source/tool.
export const SOURCE_COLOR: Record<string, string> = {
  "claude-code": "#d97757", // Claude's warm terracotta
  codex: "#22d3ee", // cyan
  opencode: "#a3e635", // lime
  pi: "#f472b6", // pink
};

export function sourceColor(id: string): string {
  return SOURCE_COLOR[id] ?? "#a78bfa";
}

// Cost-composition colors by token type.
export const COMPONENT_COLOR = {
  input: "#60a5fa",
  output: "#a78bfa",
  cacheCreate: "#fbbf24",
  cacheRead: "#34d399",
};
