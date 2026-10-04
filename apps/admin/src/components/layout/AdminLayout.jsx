import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';

/**
 * Layout del panel administrativo.
 * Sidebar fijo a la izquierda + contenido principal a la derecha.
 */
export default function AdminLayout() {
  return (
    <div className="min-h-screen flex bg-gray-50">
      {/* Sidebar */}
      <Sidebar />

      {/* Main content */}
      <main className="flex-1 ml-64 p-8 min-h-screen">
        <div className="max-w-7xl mx-auto animate-fade-in">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
