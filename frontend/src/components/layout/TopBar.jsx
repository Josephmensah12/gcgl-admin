import { useLocation } from 'react-router-dom';

const routeNames = {
  '/': 'Dashboard',
  '/pickups': 'Agent Pickups',
  '/shipments': 'Shipments',
  '/shipments/new': 'Create Shipment',
  '/customers': 'Customers',
  '/payments': 'Payments',
  '/settings/company': 'Company Settings',
  '/settings/shipments': 'Shipment Configuration',
  '/settings/catalog': 'Catalog Management',
  '/settings/payments': 'Payment Settings',
};

export default function TopBar({ onMenuClick, collapsed }) {
  const location = useLocation();

  const getPageTitle = () => {
    // Check exact match first
    if (routeNames[location.pathname]) return routeNames[location.pathname];
    // Check dynamic routes
    if (location.pathname.startsWith('/customers/')) return 'Customer Details';
    if (location.pathname.startsWith('/shipments/')) return 'Shipment Details';
    if (location.pathname.startsWith('/pickups/')) return 'Pickup Details';
    return 'GCGL Admin';
  };

  const getBreadcrumbs = () => {
    const parts = location.pathname.split('/').filter(Boolean);
    if (parts.length === 0) return [{ label: 'Dashboard', path: '/' }];
    const crumbs = [{ label: 'Home', path: '/' }];
    let path = '';
    parts.forEach((part, i) => {
      path += `/${part}`;
      const label = routeNames[path] || part.charAt(0).toUpperCase() + part.slice(1);
      crumbs.push({ label, path, active: i === parts.length - 1 });
    });
    return crumbs;
  };

  return (
    <header className="sticky top-0 z-30 bg-white border-b border-gray-200">
      <div className="flex items-center justify-between px-4 py-3 sm:px-6">
        <div className="flex items-center gap-3">
          {/* Mobile menu button */}
          <button onClick={onMenuClick} className="md:hidden text-gray-500 hover:text-gray-700">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          {/* Collapse toggle (desktop) */}
          <button onClick={onMenuClick} className="hidden md:block text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d={collapsed ? 'M13 5l7 7-7 7M5 5l7 7-7 7' : 'M11 19l-7-7 7-7M19 19l-7-7 7-7'} />
            </svg>
          </button>

          <div>
            <h1 className="text-lg font-semibold text-gray-900">{getPageTitle()}</h1>
            <nav className="hidden sm:flex items-center gap-1 text-xs text-gray-500">
              {getBreadcrumbs().map((crumb, i) => (
                <span key={i} className="flex items-center gap-1">
                  {i > 0 && <span>/</span>}
                  <span className={crumb.active ? 'text-primary-600 font-medium' : ''}>{crumb.label}</span>
                </span>
              ))}
            </nav>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="hidden sm:inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
            Live
          </span>
        </div>
      </div>
    </header>
  );
}
