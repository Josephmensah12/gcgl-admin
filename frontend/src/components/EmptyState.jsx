/**
 * Empty state for list pages with no data.
 * Pass `illustration` for a richer logistics-themed scene; falls back to
 * the small icon-in-circle motif if only `icon` is provided.
 */
export default function EmptyState({
  icon,
  illustration,
  title,
  description,
  actionLabel,
  onAction,
  actionHref,
}) {
  return (
    <div className="text-center py-16 px-6">
      {illustration ? (
        <div className="inline-flex items-center justify-center mb-5">
          {illustration}
        </div>
      ) : (
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-[#F4F6FA] mb-4">
          {icon || (
            <svg className="w-8 h-8 text-[#9CA3C0]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-2.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
            </svg>
          )}
        </div>
      )}
      <h3 className="font-display text-[20px] font-bold text-[#1A1D2B] mb-1.5 tracking-[-0.01em]">{title || 'No data yet'}</h3>
      {description && (
        <p className="text-[13px] text-[#6B7194] max-w-sm mx-auto mb-5 leading-relaxed">{description}</p>
      )}
      {actionLabel && (onAction || actionHref) && (
        actionHref ? (
          <a
            href={actionHref}
            className="inline-flex items-center gap-2 h-10 px-5 rounded-[10px] bg-[#6366F1] text-white text-[13px] font-semibold hover:bg-[#4F46E5] shadow-[0_4px_15px_rgba(99,102,241,0.25)] transition-all"
          >
            {actionLabel}
          </a>
        ) : (
          <button
            onClick={onAction}
            className="inline-flex items-center gap-2 h-10 px-5 rounded-[10px] bg-[#6366F1] text-white text-[13px] font-semibold hover:bg-[#4F46E5] shadow-[0_4px_15px_rgba(99,102,241,0.25)] transition-all"
          >
            {actionLabel}
          </button>
        )
      )}
    </div>
  );
}
