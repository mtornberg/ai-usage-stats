import { motion } from "framer-motion";

interface Props {
  label: string;
  value: string;
  sub?: string;
  accent?: string;
  delay?: number;
}

export function StatCard({ label, value, sub, accent = "#a78bfa", delay = 0 }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay }}
      className="card relative overflow-hidden p-5"
    >
      <div
        className="absolute -right-6 -top-6 h-20 w-20 rounded-full opacity-20 blur-2xl"
        style={{ background: accent }}
      />
      <div className="stat-label">{label}</div>
      <div className="mt-2 font-mono text-2xl font-semibold tracking-tight text-white">
        {value}
      </div>
      {sub && <div className="mt-1 text-xs text-white/40">{sub}</div>}
    </motion.div>
  );
}
