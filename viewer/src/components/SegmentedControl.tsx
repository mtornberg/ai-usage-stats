import { motion } from "framer-motion";

export interface Segment<T extends string> {
  value: T;
  label: string;
}

interface Props<T extends string> {
  value: T;
  options: Segment<T>[];
  onChange: (v: T) => void;
  idPrefix: string;
}

export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  idPrefix,
}: Props<T>) {
  return (
    <div className="inline-flex items-center gap-1 rounded-xl border border-white/5 bg-ink-800/80 p-1">
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className={`relative rounded-lg px-3.5 py-1.5 text-sm font-medium transition-colors ${
              active ? "text-white" : "text-white/50 hover:text-white/80"
            }`}
          >
            {active && (
              <motion.span
                layoutId={`${idPrefix}-pill`}
                transition={{ type: "spring", stiffness: 420, damping: 34 }}
                className="absolute inset-0 rounded-lg bg-gradient-to-br from-violet-500/80 to-fuchsia-500/60 shadow-[0_2px_12px_-2px_rgba(167,139,250,0.7)]"
              />
            )}
            <span className="relative z-10">{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}
