import { LineChart, Line, ResponsiveContainer } from "recharts";

interface Props {
  data: number[];
  color?: string;
  height?: number;
}

/** Minimal chrome-free sparkline for use in dense table cells. */
export function Sparkline({ data, color = "#a78bfa", height = 32 }: Props) {
  if (data.length < 2) return <div style={{ height }} className="opacity-20 text-xs flex items-center pl-1 text-white/40">—</div>;
  const chartData = data.map((v, i) => ({ i, v }));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={chartData} margin={{ top: 4, right: 2, left: 2, bottom: 4 }}>
        <Line
          type="monotone"
          dataKey="v"
          stroke={color}
          strokeWidth={1.5}
          dot={false}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
