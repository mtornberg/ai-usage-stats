import { useState, useCallback } from "react";
import type { Bucket } from "../data";
import { fmtUSD, fmtTokens } from "../format";

interface Props {
  buckets: Bucket[];
}

type SortKey = "key" | "cost" | "tokens" | "requests" | "input" | "output" | "cacheCreate" | "cacheRead";
type SortDir = "asc" | "desc";

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return (
    <span className="ml-1 inline-flex flex-col gap-px opacity-20 group-hover:opacity-60 transition-opacity">
      <span className="block h-0 w-0 border-l-[3px] border-r-[3px] border-b-[4px] border-transparent border-b-current" />
      <span className="block h-0 w-0 border-l-[3px] border-r-[3px] border-t-[4px] border-transparent border-t-current" />
    </span>
  );
  return dir === "asc"
    ? <span className="ml-1 text-violet-400">↑</span>
    : <span className="ml-1 text-violet-400">↓</span>;
}

export function BucketTable({ buckets }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("key");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const handleSort = useCallback((key: SortKey) => {
    setSortKey((prev) => {
      if (prev === key) { setSortDir((d) => (d === "desc" ? "asc" : "desc")); return key; }
      setSortDir(key === "key" ? "desc" : "desc");
      return key;
    });
  }, []);

  const active = buckets.filter((b) => b.tokens > 0);
  const rows = [...active].sort((a, b) => {
    const av = a[sortKey as keyof Bucket] as number | string;
    const bv = b[sortKey as keyof Bucket] as number | string;
    if (typeof av === "string" && typeof bv === "string")
      return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
    return sortDir === "asc" ? (av as number) - (bv as number) : (bv as number) - (av as number);
  });

  const maxCost = Math.max(...rows.map((r) => r.cost), 1e-9);

  type ColDef = { key: SortKey; label: string; right?: boolean };
  const cols: ColDef[] = [
    { key: "key", label: "Period" },
    { key: "cost", label: "Cost", right: true },
    { key: "tokens", label: "Tokens", right: true },
    { key: "requests", label: "Requests", right: true },
    { key: "input", label: "Input", right: true },
    { key: "output", label: "Output", right: true },
    { key: "cacheCreate", label: "Cache W", right: true },
    { key: "cacheRead", label: "Cache R", right: true },
  ];

  return (
    <div className="max-h-[420px] overflow-auto">
      <table className="w-full border-collapse text-sm">
        <thead className="sticky top-0 z-10 bg-ink-850/95 backdrop-blur">
          <tr>
            {cols.map((col) => (
              <th
                key={col.key}
                onClick={() => handleSort(col.key)}
                className={`group cursor-pointer select-none whitespace-nowrap px-3 py-2 text-[11px] font-medium uppercase tracking-wider text-white/40 hover:text-white/70 transition-colors ${col.right ? "text-right" : "text-left"}`}
              >
                {col.label}
                <SortIcon active={sortKey === col.key} dir={sortDir} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((b) => (
            <tr key={b.key} className="border-t border-white/5 transition-colors hover:bg-white/[0.03]">
              <td className="px-3 py-2">
                <div className="relative">
                  <span
                    className="absolute inset-y-0 left-0 -z-0 rounded bg-violet-500/10"
                    style={{ width: `${(b.cost / maxCost) * 100}%` }}
                  />
                  <span className="relative z-10 font-medium text-white/90">{b.label}</span>
                  {b.sublabel && (
                    <span className="relative z-10 ml-2 text-xs text-white/35">{b.sublabel}</span>
                  )}
                </div>
              </td>
              <td className="px-3 py-2 text-right font-mono text-white">{fmtUSD(b.cost)}</td>
              <td className="px-3 py-2 text-right font-mono text-white/80">{fmtTokens(b.tokens)}</td>
              <td className="px-3 py-2 text-right font-mono text-white/60">{b.requests.toLocaleString()}</td>
              <td className="px-3 py-2 text-right font-mono text-white/50">{fmtTokens(b.input)}</td>
              <td className="px-3 py-2 text-right font-mono text-white/50">{fmtTokens(b.output)}</td>
              <td className="px-3 py-2 text-right font-mono text-white/50">{fmtTokens(b.cacheCreate)}</td>
              <td className="px-3 py-2 text-right font-mono text-white/50">{fmtTokens(b.cacheRead)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
