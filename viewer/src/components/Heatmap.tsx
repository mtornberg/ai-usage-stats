import { DOW, type Metric } from "../data";
import { fmtUSD, fmtTokens } from "../format";

interface Props {
  matrix: number[][]; // [7][24]
  max: number;
  metric: Metric;
}

// violet ramp from transparent to bright
function cellColor(v: number, max: number): string {
  if (v <= 0 || max <= 0) return "rgba(255,255,255,0.03)";
  const t = Math.pow(v / max, 0.55); // gamma for low-end visibility
  // interpolate between deep violet and bright cyan-violet
  const a = 0.12 + t * 0.88;
  return `rgba(167,139,250,${a.toFixed(3)})`;
}

export function Heatmap({ matrix, max, metric }: Props) {
  const fmt = metric === "cost" ? fmtUSD : fmtTokens;
  const hours = Array.from({ length: 24 }, (_, h) => h);
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[640px]">
        {/* hour header */}
        <div className="mb-1 flex pl-9">
          {hours.map((h) => (
            <div key={h} className="flex-1 text-center text-[9px] text-white/30">
              {h % 3 === 0 ? h : ""}
            </div>
          ))}
        </div>
        {matrix.map((rowVals, dow) => (
          <div key={dow} className="mb-1 flex items-center">
            <div className="w-9 shrink-0 text-[10px] font-medium text-white/40">{DOW[dow]}</div>
            <div className="flex flex-1 gap-1">
              {rowVals.map((v, h) => (
                <div
                  key={h}
                  className="group relative aspect-square flex-1 rounded-[3px]"
                  style={{ background: cellColor(v, max) }}
                >
                  {v > 0 && (
                    <div className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded-md border border-white/10 bg-ink-800 px-2 py-1 text-[10px] text-white shadow-lg group-hover:block">
                      {DOW[dow]} {String(h).padStart(2, "0")}:00 · {fmt(v)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
        <div className="mt-3 flex items-center justify-end gap-2 pr-1 text-[10px] text-white/30">
          <span>less</span>
          {[0.05, 0.25, 0.5, 0.75, 1].map((t) => (
            <span key={t} className="h-3 w-3 rounded-[3px]" style={{ background: cellColor(t * max, max) }} />
          ))}
          <span>more</span>
        </div>
      </div>
    </div>
  );
}
