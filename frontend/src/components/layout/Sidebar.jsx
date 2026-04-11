import { useState, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';

const navGroups = [
  {
    label: 'MAIN',
    items: [
      { name: 'Dashboard', path: '/', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1' },
    ],
  },
  {
    label: 'OPERATIONS',
    items: [
      { name: 'Invoices', path: '/pickups', icon: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4', badgeKey: 'unpaid' },
      {
        name: 'Shipments', icon: 'M8 17h8M8 17l-2 2m2-2l-2-2m10 2l2 2m-2-2l2-2M3 9h18M3 9a2 2 0 012-2h14a2 2 0 012 2M3 9v8a2 2 0 002 2h14a2 2 0 002-2V9',
        badgeKey: 'active',
        submenu: [
          { name: 'All Shipments', path: '/shipments' },
          { name: 'Create Shipment', path: '/shipments/new' },
        ],
      },
    ],
  },
  {
    label: 'BUSINESS',
    items: [
      { name: 'Customers', path: '/customers', icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z' },
      { name: 'Payments', path: '/payments', icon: 'M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z' },
      { name: 'Expenses', path: '/expenses', icon: 'M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z' },
      { name: 'Bank Transactions', path: '/bank/review', icon: 'M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z' },
      { name: 'Fixed Costs', path: '/fixed-costs', icon: 'M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z' },
    ],
  },
  {
    label: 'ADMIN',
    items: [
      {
        name: 'Settings', icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.573-1.066z M15 12a3 3 0 11-6 0 3 3 0 016 0z',
        roles: ['Admin'],
        submenu: [
          { name: 'Company', path: '/settings/company' },
          { name: 'Shipment Config', path: '/settings/shipments' },
          { name: 'Catalog', path: '/settings/catalog' },
          { name: 'Payments', path: '/settings/payments' },
          { name: 'Bank Accounts', path: '/settings/bank' },
        ],
      },
    ],
  },
];

function initials(name) {
  return (name || '').split(' ').map((n) => n[0]).filter(Boolean).join('').slice(0, 2).toUpperCase() || 'U';
}

export default function Sidebar({ mobileOpen, onMobileClose }) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [expandedMenus, setExpandedMenus] = useState({});
  const [counts, setCounts] = useState({ unpaid: 0, active: 0 });

  useEffect(() => {
    let cancel = false;
    axios.get('/api/v1/dashboard/metrics')
      .then((res) => {
        if (cancel) return;
        const d = res.data?.data || {};
        setCounts({
          unpaid: Number(d.unpaidCount) || 0,
          active: Number(d.activeShipments) || 0,
        });
      })
      .catch(() => {});
    return () => { cancel = true; };
  }, [location.pathname]);

  const toggleSubmenu = (name) =>
    setExpandedMenus((prev) => ({ ...prev, [name]: !prev[name] }));

  const isActive = (path) => location.pathname === path;
  const isSubmenuActive = (submenu) => submenu?.some((s) => location.pathname === s.path || location.pathname.startsWith(s.path + '/'));

  const renderBadge = (item) => {
    if (item.badgeKey === 'unpaid' && counts.unpaid > 0) {
      return (
        <span className="ml-auto px-1.5 min-w-[20px] h-5 rounded-full bg-[#EF4444] text-white text-[10px] font-bold flex items-center justify-center">
          {counts.unpaid > 99 ? '99+' : counts.unpaid}
        </span>
      );
    }
    if (item.badgeKey === 'active' && counts.active > 0) {
      return (
        <span className="ml-auto px-1.5 min-w-[20px] h-5 rounded-full bg-[#3B82F6] text-white text-[10px] font-bold flex items-center justify-center">
          {counts.active}
        </span>
      );
    }
    return null;
  };

  const renderNavItem = (item) => {
    if (item.roles && !item.roles.includes(user?.role)) return null;
    const hasSubmenu = item.submenu?.length > 0;
    const active = hasSubmenu ? isSubmenuActive(item.submenu) : isActive(item.path);
    const expanded = expandedMenus[item.name] || isSubmenuActive(item.submenu);

    const baseClasses =
      'relative w-full flex items-center gap-3 px-3 py-2.5 rounded-[10px] text-[13.5px] font-medium transition-all duration-200';
    const activeClasses =
      'text-white bg-gradient-to-br from-[rgba(99,102,241,0.25)] to-[rgba(59,130,246,0.15)]';
    const inactiveClasses =
      'text-white/50 hover:text-white/80 hover:bg-white/[0.06]';

    const iconClasses = `w-5 h-5 shrink-0 ${active ? 'opacity-100' : 'opacity-70'}`;

    if (hasSubmenu) {
      return (
        <div key={item.name}>
          <button
            onClick={() => toggleSubmenu(item.name)}
            className={`${baseClasses} ${active ? activeClasses : inactiveClasses}`}
          >
            {active && (
              <span className="absolute left-[-12px] top-1 bottom-1 w-[3px] rounded-r-md bg-[#6366F1]" />
            )}
            <svg className={iconClasses} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
            </svg>
            <span className="flex-1 text-left">{item.name}</span>
            {renderBadge(item)}
            <svg className={`w-4 h-4 transition-transform ${expanded ? 'rotate-90' : ''} opacity-60`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
          {expanded && (
            <div className="ml-9 mt-1 space-y-0.5">
              {item.submenu.map((sub) => (
                <NavLink
                  key={sub.path}
                  to={sub.path}
                  onClick={onMobileClose}
                  className={({ isActive: ia }) =>
                    `block px-3 py-1.5 rounded-md text-[12.5px] transition-colors ${
                      ia ? 'text-white' : 'text-white/40 hover:text-white/70'
                    }`
                  }
                >
                  {sub.name}
                </NavLink>
              ))}
            </div>
          )}
        </div>
      );
    }

    return (
      <NavLink
        key={item.path}
        to={item.path}
        end={item.path === '/'}
        onClick={onMobileClose}
        className={({ isActive: ia }) =>
          `${baseClasses} ${ia ? activeClasses : inactiveClasses}`
        }
      >
        {({ isActive: ia }) => (
          <>
            {ia && (
              <span className="absolute left-[-12px] top-1 bottom-1 w-[3px] rounded-r-md bg-[#6366F1]" />
            )}
            <svg className={`w-5 h-5 shrink-0 ${ia ? 'opacity-100' : 'opacity-70'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
            </svg>
            <span>{item.name}</span>
            {renderBadge(item)}
          </>
        )}
      </NavLink>
    );
  };

  const content = (
    <div className="flex flex-col h-full">
      {/* Brand block */}
      <div className="px-6 py-5 border-b border-white/[0.06]">
        <div className="flex items-center gap-3">
          <div
            className="w-[42px] h-[42px] rounded-[10px] flex items-center justify-center text-white font-bold text-sm"
            style={{
              background: 'linear-gradient(135deg, #F59E0B, #D97706)',
              boxShadow: '0 4px 15px rgba(245, 158, 11, 0.3)',
            }}
          >
            GC
          </div>
          <div>
            <h1 className="text-white font-bold text-[15px] leading-tight tracking-tight">GCGL Admin</h1>
            <p className="text-white/40 text-[10px] uppercase tracking-[0.05em] mt-0.5">Logistics Portal</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto pl-6 pr-4 py-2">
        {navGroups.map((group) => (
          <div key={group.label} className="mb-1">
            <p className="px-3 pt-4 pb-2 text-[10px] font-semibold text-white/25 uppercase tracking-[0.12em]">
              {group.label}
            </p>
            <div className="space-y-0.5">
              {group.items.map(renderNavItem)}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer user card */}
      <div className="px-4 py-4 border-t border-white/[0.06]">
        <div className="flex items-center gap-3 px-2">
          <div
            className="w-9 h-9 rounded-[10px] flex items-center justify-center text-white text-[12px] font-bold shrink-0"
            style={{ background: 'linear-gradient(135deg, #6366F1, #3B82F6)' }}
          >
            {initials(user?.full_name)}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-semibold text-white truncate leading-tight">{user?.full_name || 'User'}</p>
            <p className="text-[11px] text-white/35 mt-0.5">{user?.role || '—'}</p>
          </div>
          <button
            onClick={logout}
            className="text-white/35 hover:text-[#EF4444] transition-colors p-1"
            title="Logout"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={onMobileClose}
        />
      )}
      {/* Mobile */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-[260px] bg-[#0F1629] transform transition-transform md:hidden ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {content}
      </aside>
      {/* Desktop */}
      <aside className="hidden md:flex md:flex-col md:fixed md:inset-y-0 md:w-[260px] bg-[#0F1629]">
        {content}
      </aside>
    </>
  );
}
