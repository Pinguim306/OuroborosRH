export function StatTile({
  label,
  value,
  sub,
  accent = false,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <div className={`glass p-5 ${accent ? "border-venom-500/25" : ""}`}>
      <div className="label">{label}</div>
      <div className={`stat-value mt-1.5 ${accent ? "text-gradient" : ""}`}>{value}</div>
      {sub && <div className="mt-1 text-xs text-white/40">{sub}</div>}
    </div>
  );
}
