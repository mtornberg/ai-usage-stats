import {
  BarChart, Bar, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from "recharts";
import type { Bucket } from "../data";
import { fmtUSD, fmtUSDCompact } from "../format";
import { COMPONENT_COLOR } from "../theme";

interface Props {
  buckets: Bucket[];
}

const PARTS: { key: keyof Bucket; name: string; color: string }[] = [
  { key: "costInput", name: "Input", color: COMPONENT_COLOR.input },
  { key: "costCacheCreate", name: "Cache write", color: COMPONENT_COLOR.cacheCreate },
  { key: "costCacheRead", name: "Cache read", color: COMPONENT_COLOR.cacheRead },
  { key: "costOutput", name: "Output", color: COMPONENT_COLOR.output },
];

function Tip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const total = payload.reduce((s: number, p: any) => s + (p.value || 0), 0);
  return (
    <div className="card !rounded-xl border-white/10 p-3 text-xs">
      <div className="mb-1.5 font-semibold text-white">{label}</div>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center justify-between gap-6">
          <span className="flex items-center gap-1.5 text-white/60">
            <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
            {p.name}
          </span>
          <span className="font-mono text-white">{fmtUSD(p.value)}</span>
        </div>
      ))}
      <div className="mt-1.5 flex justify-between gap-6 border-t border-white/10 pt-1.5">
        <span className="text-white/50">Total</span>
        <span className="font-mono text-white">{fmtUSD(total)}</span>
      </div>
    </div>
  );
}

export function CostCompositionChart({ buckets }: Props) {
  const maxLabels = 14;
  const step = Math.max(1, Math.ceil(buckets.length / maxLabels));
  return (
    <ResponsiveContainer width="100%" height={320}>
      <BarChart data={buckets} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
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
          tickFormatter={(v: number) => fmtUSDCompact(v)}
        />
        <Tooltip cursor={{ fill: "rgba(255,255,255,0.04)" }} content={<Tip />} />
        <Legend
          iconType="circle"
          wrapperStyle={{ fontSize: 12, color: "rgba(255,255,255,0.6)" }}
        />
        {PARTS.map((p, i) => (
          <Bar
            key={p.key as string}
            dataKey={p.key as string}
            name={p.name}
            stackId="cost"
            fill={p.color}
            radius={i === PARTS.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
            maxBarSize={46}
            animationDuration={600}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
