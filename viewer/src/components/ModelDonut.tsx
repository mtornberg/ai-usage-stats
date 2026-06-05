import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import type { Slice, Metric } from "../data";
import { colorFor } from "../theme";
import { fmtUSD, fmtTokens, fmtPct, shortModel } from "../format";

interface Props {
  slices: Slice[];
  metric: Metric;
  noun?: string;
  colorOf?: (name: string, i: number) => string;
  labelOf?: (name: string) => string;
}

export function ModelDonut({
  slices,
  metric,
  noun = "models",
  colorOf,
  labelOf = shortModel,
}: Props) {
  const valueOf = (s: Slice) => (metric === "cost" ? s.cost : s.tokens);
  const total = slices.reduce((sum, s) => sum + valueOf(s), 0) || 1;
  const data = slices.map((s, i) => ({
    ...s,
    value: valueOf(s),
    color: colorOf ? colorOf(s.name, i) : colorFor(i),
  }));

  return (
    <div className="flex items-center gap-5">
      <div className="relative h-[150px] w-[150px] shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              innerRadius={48}
              outerRadius={72}
              paddingAngle={2}
              stroke="none"
              animationDuration={600}
            >
              {data.map((d, i) => (
                <Cell key={i} fill={d.color} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <div className="text-[10px] uppercase tracking-wider text-white/40">
            {slices.length} {noun}
          </div>
          <div className="font-mono text-sm font-semibold text-white">
            {metric === "cost" ? fmtUSD(total) : fmtTokens(total)}
          </div>
        </div>
      </div>
      <div className="min-w-0 flex-1 space-y-2">
        {data.slice(0, 6).map((d) => (
          <div key={d.name} className="flex items-center gap-2.5 text-sm">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: d.color }} />
            <span className="truncate text-white/80" title={d.name}>
              {labelOf(d.name)}
            </span>
            <span className="ml-auto shrink-0 font-mono text-xs text-white/50">
              {fmtPct(d.value / total)}
            </span>
            <span className="w-16 shrink-0 text-right font-mono text-xs text-white">
              {metric === "cost" ? fmtUSD(d.cost) : fmtTokens(d.tokens)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
