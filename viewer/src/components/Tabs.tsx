import { motion } from "framer-motion";

interface Props<T extends string> {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}

export function Tabs<T extends string>({ value, options, onChange }: Props<T>) {
  return (
    <div className="flex items-center gap-1 border-b border-white/5">
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className={`relative px-4 py-2.5 text-sm font-medium transition-colors ${
              active ? "text-white" : "text-white/45 hover:text-white/75"
            }`}
          >
            {opt.label}
            {active && (
              <motion.span
                layoutId="tab-underline"
                transition={{ type: "spring", stiffness: 420, damping: 34 }}
                className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-gradient-to-r from-violet-400 to-fuchsia-400"
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
