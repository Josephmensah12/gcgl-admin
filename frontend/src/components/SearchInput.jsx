/**
 * Search input with leading icon and a trailing clear (×) button that
 * appears when there's text. Use as a controlled input.
 *
 * Props:
 *   value, onChange — controlled state (onChange receives the new string, not an event)
 *   placeholder
 *   className — applied to the wrapping <div>
 *   inputClassName — applied to the <input> if you need a different look
 *   autoFocus
 */
export default function SearchInput({
  value,
  onChange,
  placeholder = 'Search…',
  className = '',
  inputClassName = '',
  autoFocus = false,
  type = 'search',
}) {
  const baseInput =
    'w-full h-10 pl-9 pr-9 rounded-[10px] border border-black/[0.06] bg-white text-[13px] text-[#1A1D2B] placeholder:text-[#9CA3C0] focus:border-[#6366F1] focus:ring-2 focus:ring-[rgba(99,102,241,0.15)] outline-none transition-all';

  return (
    <div className={`relative ${className}`}>
      <svg
        className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#9CA3C0] pointer-events-none"
        fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        aria-hidden="true"
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className={inputClassName || baseInput}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="Clear search"
          className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full flex items-center justify-center text-[#9CA3C0] hover:text-[#1A1D2B] hover:bg-[#F4F6FA] transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  );
}
