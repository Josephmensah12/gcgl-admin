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
      <div className="min-h-screen bg-[#F4F6FA]">
        <Sidebar
          mobileOpen={mobileOpen}
          onMobileClose={() => setMobileOpen(false)}
        />

        <div className="md:ml-[260px]">
          <main className="px-6 py-7 md:px-8 md:py-7">
            <Outlet />
          </main>
        </div>
      </div>
    </LayoutContext.Provider>
  );
}
