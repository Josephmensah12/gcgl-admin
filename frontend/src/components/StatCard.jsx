const ACCENTS = {
  gold:   { gradient: 'linear-gradient(135deg, #F59E0B, #D97706)', iconBg: 'rgba(245,158,11,0.08)', iconColor: '#F59E0B' },
  blue:   { gradient: 'linear-gradient(135deg, #6366F1, #3B82F6)', iconBg: 'rgba(59,130,246,0.08)', iconColor: '#3B82F6' },
  indigo: { gradient: 'linear-gradient(135deg, #6366F1, #4F46E5)', iconBg: 'rgba(99,102,241,0.08)', iconColor: '#6366F1' },
  green:  { gradient: 'linear-gradient(135deg, #10B981, #059669)', iconBg: 'rgba(16,185,129,0.08)', iconColor: '#10B981' },
  red:    { gradient: 'linear-gradient(135deg, #EF4444, #DC2626)', iconBg: 'rgba(239,68,68,0.07)',  iconColor: '#EF4444' },
  purple: { gradient: 'linear-gradient(135deg, #8B5CF6, #6366F1)', iconBg: 'rgba(139,92,246,0.08)', iconColor: '#8B5CF6' },
};

const DEFAULT_ICON = 'M3 3h18v18H3z';

export default function StatCard({ label, value, subtext, trend, accent = 'blue', icon = DEFAULT_ICON }) {
  const a = ACCENTS[accent] || ACCENTS.blue;

  return (
    <div className="relative overflow-hidden bg-white rounded-[14px] px-4 py-3 border border-black/[0.04] shadow-[0_1px_3px_rgba(0,0,0,0.04),0_1px_2px_rgba(0,0,0,0.02)] hover:shadow-[0_4px_20px_rgba(0,0,0,0.06)] transition-all duration-300">
      <div
        className="absolute top-0 left-0 bottom-0 w-[3px] rounded-l-[14px]"
        style={{ background: a.gradient }}
      />
      <div className="flex items-center gap-3">
        <div
          className="w-[34px] h-[34px] rounded-[8px] flex items-center justify-center shrink-0"
          style={{ background: a.iconBg, color: a.iconColor }}
        >
          <svg className="w-[16px] h-[16px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-medium text-[#6B7194] leading-tight uppercase tracking-[0.05em]">{label}</p>
          <div className="font-display-tabular text-[22px] font-bold text-[#1A1D2B] leading-[1.1]">
            {value}
          </div>
        </div>
        {(subtext || trend) && (
          <div className="text-right shrink-0">
            {subtext && <p className="text-[10px] text-[#9CA3C0] leading-tight">{subtext}</p>}
            {trend && (
              <span
                className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10px] font-semibold mt-0.5 ${
                  trend.variant === 'positive'
                    ? 'bg-[rgba(16,185,129,0.08)] text-[#10B981]'
                    : trend.variant === 'negative'
                    ? 'bg-[rgba(239,68,68,0.07)] text-[#EF4444]'
                    : 'bg-[rgba(99,102,241,0.08)] text-[#6366F1]'
                }`}
              >
                {trend.arrow && <span>{trend.arrow}</span>}
                {trend.label}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
