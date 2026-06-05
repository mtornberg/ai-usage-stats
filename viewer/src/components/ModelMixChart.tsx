import {
  AreaChart, Area, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid,
} from "recharts";
import { colorFor } from "../theme";
import { fmtUSD, fmtTokens, fmtUSDCompact, shortModel } from "../format";
import type { Metric } from "../data";

interface Props {
  data: Array<Record<string, number | string>>;
  models: string[];
  metric: Metric;
}

function Tip({ active, payload, label, metric }: any) {
  if (!active || !payload?.length) return null;
  const fmt = metric === "cost" ? fmtUSD : fmtTokens;
  const shown = payload.filter((p: any) => p.value > 0).reverse();
  return (
    <div className="card !rounded-xl border-white/10 p-3 text-xs">
      <div className="mb-1.5 font-semibold text-white">{label}</div>
      {shown.map((p: any) => (
        <div key={p.dataKey} className="flex items-center justify-between gap-6">
          <span className="flex items-center gap-1.5 text-white/60">
            <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
            {shortModel(p.dataKey)}
          </span>
          <span className="font-mono text-white">{fmt(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

export function ModelMixChart({ data, models, metric }: Props) {
  const maxLabels = 14;
  const step = Math.max(1, Math.ceil(data.length / maxLabels));
  return (
    <ResponsiveContainer width="100%" height={300}>
      <AreaChart data={data} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
        <defs>
          {models.map((m, i) => (
            <linearGradient key={m} id={`mix-${i}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={colorFor(i)} stopOpacity={0.85} />
              <stop offset="100%" stopColor={colorFor(i)} stopOpacity={0.25} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />
        <XAxis
          dataKey="label"
          tick={{ fill: "rgba(255,255,255,0.45)", fontSize: 11 }}
          tickLine={false}
          axisLine={{ stroke: "rgba(255,255,255,0.08)" }}
          interval={step - 1}
          minTickGap={8}
        />
        <YAxis
          tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          width={56}
          tickFormatter={(v: number) => (metric === "cost" ? fmtUSDCompact(v) : fmtTokens(v))}
        />
        <Tooltip content={<Tip metric={metric} />} />
        {models.map((m, i) => (
          <Area
            key={m}
            type="monotone"
            dataKey={m}
            stackId="mix"
            stroke={colorFor(i)}
            strokeWidth={1}
            fill={`url(#mix-${i})`}
            animationDuration={600}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}
