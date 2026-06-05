export function fmtUSD(n: number, digits = 2): string {
  return (
    "$" +
    n.toLocaleString("en-US", {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    })
  );
}

export function fmtUSDCompact(n: number): string {
  if (n >= 1000) return "$" + (n / 1000).toFixed(1) + "k";
  if (n < 1 && n > 0) return "$" + n.toFixed(3);
  return "$" + n.toFixed(2);
}

export function fmtTokens(n: number): string {
  if (n >= 1e9) return (n / 1e9).toFixed(2) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(2) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
  return String(Math.round(n));
}

export function fmtInt(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

export function fmtPct(n: number): string {
  return (n * 100).toFixed(n >= 0.1 ? 0 : 1) + "%";
}

export function shortModel(m: string): string {
  return m
    .replace(/^[a-z0-9_-]+\//, "") // strip provider/ prefix
    .replace(/^claude-/, "")
    .replace(/-\d{8}$/, "")
    .replace(/-v\d+:\d+$/, "");
}

export function fmtDuration(ms: number | null): string {
  if (ms === null || !isFinite(ms)) return "—";
  if (ms >= 60000) return (ms / 60000).toFixed(1) + "m";
  if (ms >= 1000) return (ms / 1000).toFixed(1) + "s";
  return Math.round(ms) + "ms";
}

export function fmtRate(n: number | null): string {
  if (n === null || !isFinite(n)) return "—";
  return Math.round(n) + " t/s";
}

export function shortProject(p: string): string {
  // Worktree projects are labeled "<branch>/<repo>"; the branch is the
  // distinguishing part, so prefer it over the (often shared) repo folder.
  const parts = p.split("/");
  const base = parts.length > 1 ? parts[0] : p;
  if (base.length <= 30) return base;
  return base.slice(0, 28) + "…";
}
