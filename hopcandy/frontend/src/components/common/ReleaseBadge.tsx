export function ReleaseBadge({ label }: { label: string }) {
  const tone = label.toLowerCase().includes('stable') ? 'stable'
    : label.toLowerCase().includes('development') ? 'development' : 'ablation';
  const displayLabel = tone === 'stable' ? '稳定版' : tone === 'development' ? '开发基线' : '消融实验';
  return <span className={`release-badge ${tone}`}>{displayLabel}</span>;
}
