import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, ClipboardList, Building2, Users, DollarSign,
  LogOut, Snowflake, Settings, CalendarDays
} from 'lucide-react';
import { useAdminAuth } from '../../App';

/**
 * Sidebar de navegación del panel administrativo.
 * Fijo a la izquierda, con logo, links y logout.
 */
export default function Sidebar() {
  const { profile, logout } = useAdminAuth();

  const navItems = [
    { to: '/', icon: LayoutDashboard, label: 'Dashboard', end: true },
    { to: '/calendario', icon: CalendarDays, label: 'Calendario' },
    { to: '/ordenes', icon: ClipboardList, label: 'Órdenes de Trabajo' },
    { to: '/clientes', icon: Building2, label: 'Clientes' },
    { to: '/tecnicos', icon: Users, label: 'Técnicos' },
    { to: '/extras', icon: DollarSign, label: 'Adicionales' },
  ];

  return (
    <aside className="fixed left-0 top-0 bottom-0 w-64 bg-sidebar flex flex-col z-40">
      {/* Logo */}
      <div className="px-6 py-6 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="h-10 flex items-center justify-center flex-shrink-0">
            <img src="/logo4sclima.webp" alt="4S Clima Logo" className="h-full w-auto object-contain brightness-0 invert" />
          </div>
          <div className="flex flex-col justify-center">
            <p className="text-blue-200 text-xs uppercase tracking-widest font-semibold border-l border-white/20 pl-3 ml-1">Panel Admin</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {navItems.map(({ to, icon: Icon, label, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `sidebar-link ${isActive ? 'active' : ''}`
            }
          >
            <Icon size={18} />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>

      {/* User info + logout */}
      <div className="px-3 py-4 border-t border-white/10">
        <div className="flex items-center gap-3 px-4 py-2 mb-2">
          <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center flex-shrink-0 shadow-sm">
            <span className="text-white text-xs font-bold">
              {profile?.name?.[0]?.toUpperCase() || 'A'}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white text-sm font-medium truncate">
              {profile?.name || 'Admin'}
            </p>
            <p className="text-blue-200 text-[10px] truncate font-medium">Administrador</p>
          </div>
        </div>
        <button
          onClick={logout}
          className="sidebar-link w-full text-blue-100 hover:text-white hover:bg-red-500"
        >
          <LogOut size={18} />
          <span>Cerrar Sesión</span>
        </button>
      </div>
    </aside>
  );
}
