import {
  Bar,
  Line,
  ComposedChart,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
} from "recharts";
import type { Bucket, Metric } from "../data";
import { fmtUSD, fmtTokens, fmtUSDCompact } from "../format";
import { ACCENT, ACCENT_2 } from "../theme";

interface Props {
  buckets: Bucket[];
  metric: Metric;
}

function CustomTooltip({ active, payload, metric }: any) {
  if (!active || !payload || !payload.length) return null;
  const b: Bucket = payload[0].payload;
  return (
    <div className="card !rounded-xl border-white/10 p-3 text-xs">
      <div className="mb-1.5 font-semibold text-white">
        {b.label}
        {b.sublabel ? <span className="text-white/40"> · {b.sublabel}</span> : null}
      </div>
      <div className="flex items-center justify-between gap-6">
        <span className="text-white/50">Cost</span>
        <span className="font-mono text-white">{fmtUSD(b.cost)}</span>
      </div>
      <div className="flex items-center justify-between gap-6">
        <span className="text-white/50">Tokens</span>
        <span className="font-mono text-white">{fmtTokens(b.tokens)}</span>
      </div>
      <div className="mt-1.5 border-t border-white/10 pt-1.5 text-[11px] text-white/40">
        <div className="flex justify-between gap-6">
          <span>input / output</span>
          <span className="font-mono">
            {fmtTokens(b.input)} / {fmtTokens(b.output)}
          </span>
        </div>
        <div className="flex justify-between gap-6">
          <span>cache write / read</span>
          <span className="font-mono">
            {fmtTokens(b.cacheCreate)} / {fmtTokens(b.cacheRead)}
          </span>
        </div>
      </div>
      {metric === "cost" && (
        <div className="mt-1 text-[11px] text-cyan-300/70">
          cumulative line shows running total
        </div>
      )}
    </div>
  );
}

export function UsageChart({ buckets, metric }: Props) {
  const key = metric === "cost" ? "cost" : "tokens";

  // Running cumulative for the overlay line.
  let run = 0;
  const data = buckets.map((b) => {
    run += metric === "cost" ? b.cost : b.tokens;
    return { ...b, _cum: run };
  });

  const maxLabels = 14;
  const step = Math.max(1, Math.ceil(data.length / maxLabels));

  return (
    <ResponsiveContainer width="100%" height={320}>
      <ComposedChart data={data} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="barFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={ACCENT} stopOpacity={0.95} />
            <stop offset="100%" stopColor={ACCENT} stopOpacity={0.35} />
          </linearGradient>
        </defs>
        <CartesianGrid
          vertical={false}
          stroke="rgba(255,255,255,0.06)"
          strokeDasharray="3 3"
        />
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
          tickFormatter={(v: number) =>
            metric === "cost" ? fmtUSDCompact(v) : fmtTokens(v)
          }
        />
        <Tooltip
          cursor={{ fill: "rgba(255,255,255,0.04)" }}
          content={<CustomTooltip metric={metric} />}
        />
        <Bar
          dataKey={key}
          radius={[5, 5, 0, 0]}
          fill="url(#barFill)"
          maxBarSize={46}
          animationDuration={650}
        >
          {data.map((_, i) => (
            <Cell key={i} />
          ))}
        </Bar>
        <Line
          type="monotone"
          dataKey="_cum"
          stroke={ACCENT_2}
          strokeWidth={2}
          dot={false}
          yAxisId="cum"
          animationDuration={650}
        />
        <YAxis yAxisId="cum" hide domain={[0, "dataMax"]} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
