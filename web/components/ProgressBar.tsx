export function ProgressBar({ value, label }: { value: number; label?: string }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div>
      {label && (
        <div className="mb-1.5 flex justify-between text-xs">
          <span className="text-white/50">{label}</span>
          <span className="font-mono text-venom-400">{pct.toFixed(0)}%</span>
        </div>
      )}
      <div className="h-2 overflow-hidden rounded-full bg-white/5">
        <div
          className="h-full rounded-full bg-gradient-to-r from-venom-600 via-venom-400 to-acid transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
