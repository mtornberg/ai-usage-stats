import type { Slice } from "../data";
import { fmtUSD } from "../format";

const PROVIDER_COLOR: Record<string, string> = {
  "Anthropic":       "#d97757",
  "GitHub Copilot":  "#22d3ee",
  "Amazon Bedrock":  "#fbbf24",
  "Azure":           "#60a5fa",
  "OpenAI":          "#a3e635",
  "LM Studio":       "#c084fc",
  "OpenCode":        "#f472b6",
  "Google":          "#34d399",
};

function providerColor(name: string): string {
  return PROVIDER_COLOR[name] ?? "#a78bfa";
}

interface Props {
  providers: Slice[];
  active: Set<string>;
  onToggle: (name: string) => void;
}

export function ProviderFilter({ providers, active, onToggle }: Props) {
  if (providers.length <= 1) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {providers.map((p) => {
        const on = active.has(p.name);
        const color = providerColor(p.name);
        return (
          <button
            key={p.name}
            onClick={() => onToggle(p.name)}
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
            <span className="font-medium">{p.name}</span>
            <span className="font-mono text-xs text-white/40">{fmtUSD(p.cost)}</span>
          </button>
        );
      })}
    </div>
  );
}
