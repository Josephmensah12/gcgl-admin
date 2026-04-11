import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

/**
 * Reusable page header.
 *
 * Props:
 *   title       - required, page title string
 *   subtitle    - optional, description shown under title
 *   onMenuClick - optional, fires when the mobile hamburger is tapped
 *   actions     - optional, ReactNode rendered before the search bar
 *                 (e.g. a "New Invoice" button)
 *   hideSearch  - optional, drop the search input when the page doesn't need it
 */
export default function PageHeader({
  title,
  subtitle,
  onMenuClick,
  actions,
  hideSearch = false,
}) {
  const navigate = useNavigate();
  const [searchText, setSearchText] = useState('');

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    if (searchText.trim()) {
      navigate(`/pickups?search=${encodeURIComponent(searchText.trim())}`);
    }
  };

  return (
    <header className="flex items-center justify-between gap-4 mb-6">
      <div className="flex items-center gap-3 min-w-0">
        {/* Mobile menu */}
        {onMenuClick && (
          <button
            type="button"
            onClick={onMenuClick}
            className="md:hidden p-2 rounded-[10px] bg-white border border-black/[0.04] text-[#6B7194] hover:text-[#1A1D2B] shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
            aria-label="Open menu"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        )}

        <div className="min-w-0">
          <h1 className="text-[26px] font-extrabold text-[#1A1D2B] tracking-[-0.5px] leading-tight truncate">
            {title}
          </h1>
          {subtitle && (
            <p className="text-[13.5px] text-[#6B7194] mt-0.5 truncate">{subtitle}</p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3">
        {/* Live badge */}
        <div className="hidden sm:inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[rgba(16,185,129,0.08)] text-[#10B981] text-xs font-semibold">
          <span className="w-[7px] h-[7px] rounded-full bg-[#10B981] animate-pulse-dot" />
          Live
        </div>

        {actions}

        {/* Search */}
        {!hideSearch && (
          <form
            onSubmit={handleSearchSubmit}
            className="hidden md:flex items-center relative"
          >
            <svg
              className="w-4 h-4 absolute left-3 text-[#9CA3C0] pointer-events-none"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="search"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="Search invoices, customers..."
              className="h-10 min-w-[220px] pl-9 pr-4 rounded-[10px] bg-white border border-black/[0.04] text-[13px] text-[#1A1D2B] placeholder:text-[#9CA3C0] shadow-[0_1px_3px_rgba(0,0,0,0.04)] focus:border-[#6366F1] focus:ring-2 focus:ring-[rgba(99,102,241,0.15)] outline-none transition-all"
            />
          </form>
        )}

        {/* Notification bell */}
        <button
          type="button"
          className="relative w-10 h-10 rounded-[10px] bg-white border border-black/[0.04] text-[#6B7194] hover:text-[#1A1D2B] hover:border-[#6366F1] shadow-[0_1px_3px_rgba(0,0,0,0.04)] flex items-center justify-center transition-all"
          aria-label="Notifications"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
          </svg>
          <span className="absolute top-2 right-2 w-[7px] h-[7px] rounded-full bg-[#EF4444]" />
        </button>
      </div>
    </header>
  );
}
