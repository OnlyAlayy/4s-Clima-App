import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';

/**
 * Layout del panel administrativo.
 * Sidebar colapsable a la izquierda + contenido principal adaptativo a la derecha.
 */
export default function AdminLayout() {
  const [isCollapsed, setIsCollapsed] = useState(() => {
    return localStorage.getItem('sidebar_collapsed') === 'true';
  });

  const toggleSidebar = () => {
    setIsCollapsed(prev => {
      const next = !prev;
      localStorage.setItem('sidebar_collapsed', String(next));
      return next;
    });
  };

  return (
    <div className="min-h-screen flex bg-gray-50 dark:bg-slate-900 transition-colors duration-200">
      {/* Sidebar */}
      <Sidebar isCollapsed={isCollapsed} toggleSidebar={toggleSidebar} />

      {/* Main content adaptable al ancho colapsado */}
      <main
        className={`flex-1 ${
          isCollapsed ? 'ml-20' : 'ml-64'
        } p-6 lg:p-8 min-h-screen transition-all duration-300 ease-in-out`}
      >
        <div className="max-w-[1600px] w-full mx-auto animate-fade-in">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

