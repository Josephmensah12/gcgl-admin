import { useState, createContext, useContext } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';

const LayoutContext = createContext({ onMenuClick: () => {} });

export function useLayout() {
  return useContext(LayoutContext);
}

export default function Layout() {
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleMenuClick = () => setMobileOpen((p) => !p);

  return (
    <LayoutContext.Provider value={{ onMenuClick: handleMenuClick }}>
      <div className="min-h-screen transition-colors duration-300">
        <Sidebar
          mobileOpen={mobileOpen}
          onMobileClose={() => setMobileOpen(false)}
        />

        <div className="md:ml-[260px]">
          <main className="px-4 py-5 sm:px-6 sm:py-7 md:px-8 md:py-7">
            <Outlet />
          </main>
        </div>
      </div>
    </LayoutContext.Provider>
  );
}
