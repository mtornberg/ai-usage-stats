import type { SourceSummary, SourceId } from "../data";
import { sourceColor } from "../theme";
import { fmtUSD } from "../format";

interface Props {
  sources: SourceSummary[];
  active: Set<SourceId>;
  onToggle: (id: SourceId) => void;
}

export function SourceFilter({ sources, active, onToggle }: Props) {
  if (sources.length <= 1) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {sources.map((s) => {
        const on = active.has(s.id);
        const color = sourceColor(s.id);
        return (
          <button
            key={s.id}
            onClick={() => onToggle(s.id)}
            className={`group flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-all ${
              on
                ? "border-white/15 bg-white/[0.06] text-white"
                : "border-white/5 bg-transparent text-white/35 hover:text-white/60"
            }`}
          >
            <span
              className="h-2.5 w-2.5 rounded-full transition-opacity"
              style={{ background: color, opacity: on ? 1 : 0.3 }}
            />
            <span className="font-medium">{s.label}</span>
            <span className="font-mono text-xs text-white/40">{fmtUSD(s.cost)}</span>
          </button>
        );
      })}
    </div>
  );
}
