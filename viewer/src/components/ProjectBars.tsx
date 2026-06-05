import { motion } from "framer-motion";
import type { Slice, Metric } from "../data";
import { fmtUSD, fmtTokens, shortProject } from "../format";
import { colorFor } from "../theme";

interface Props {
  slices: Slice[];
  metric: Metric;
}

export function ProjectBars({ slices, metric }: Props) {
  const valueOf = (s: Slice) => (metric === "cost" ? s.cost : s.tokens);
  const top = slices.slice(0, 8);
  const max = Math.max(...top.map(valueOf), 1);

  return (
    <div className="space-y-3">
      {top.map((s, i) => {
        const v = valueOf(s);
        return (
          <div key={s.name}>
            <div className="mb-1 flex items-center justify-between text-sm">
              <span className="truncate text-white/80" title={s.name}>
                {shortProject(s.name)}
              </span>
              <span className="ml-3 shrink-0 font-mono text-xs text-white">
                {metric === "cost" ? fmtUSD(s.cost) : fmtTokens(s.tokens)}
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-white/5">
              <motion.div
                className="h-full rounded-full"
                style={{
                  background: `linear-gradient(90deg, ${colorFor(i)}, ${colorFor(
                    i,
                  )}99)`,
                }}
                initial={{ width: 0 }}
                animate={{ width: `${(v / max) * 100}%` }}
                transition={{ duration: 0.55, delay: i * 0.04, ease: "easeOut" }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
