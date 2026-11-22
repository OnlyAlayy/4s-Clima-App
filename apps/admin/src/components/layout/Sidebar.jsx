import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, ClipboardList, Building2, Users, DollarSign,
  LogOut, CalendarDays, Sun, Moon, Wallet, ChevronLeft, ChevronRight, Clock,
  MessageSquare, FileCheck
} from 'lucide-react';
import { useAdminAuth } from '../../App';
import { useDarkMode } from '../../hooks/useDarkMode';
import { useAdminBadges } from '../../hooks/useAdminBadges';
import AdminNotificationToast from '../AdminNotificationToast';

/**
 * Sidebar de navegación del panel administrativo.
 * Fijo a la izquierda con opción de colapsar / expandir mediante flecha.
 * Integra contadores en tiempo real (badges) y notificaciones toast no invasivas.
 */
export default function Sidebar({ isCollapsed = false, toggleSidebar }) {
  const { user, profile, logout } = useAdminAuth();
  const { isDark, toggleDarkMode } = useDarkMode();
  const [logoError, setLogoError] = useState(false);
  const { badges, toast, dismissToast } = useAdminBadges();

  const isOwner = profile?.role === 'owner';
  const displayName = profile?.name || profile?.full_name || user?.email || 'Usuario';
  const displayRole = isOwner ? 'Owner' : (profile?.role === 'admin' ? 'Administrador' : 'Usuario');
  const userInitial = (displayName?.[0] || 'U').toUpperCase();

  const navGroups = [
    {
      label: 'OPERACIÓN',
      items: [
        { to: '/', icon: LayoutDashboard, label: 'Dashboard', end: true },
        { to: '/leads', icon: MessageSquare, label: 'Consultas Web', badge: badges.leads, badgeColor: 'amber' },
        { to: '/quotes', icon: FileCheck, label: 'Presupuestos' },
        { to: '/ordenes', icon: ClipboardList, label: 'Órdenes de Trabajo', badge: badges.workOrders, badgeColor: 'amber' },
        { to: '/calendario', icon: CalendarDays, label: 'Calendario' },
      ]
    },
    {
      label: 'ADMINISTRACIÓN',
      items: [
        { to: '/finanzas', icon: Wallet, label: 'Cobranzas' },
        { to: '/clientes', icon: Building2, label: 'Clientes' },
        { to: '/tecnicos', icon: Users, label: 'Técnicos' },
        { to: '/asistencia', icon: Clock, label: 'Control Asistencia', badge: badges.attendance, badgeColor: 'rose' },
        { to: '/extras', icon: DollarSign, label: 'Catálogo Extras' },
      ]
    }
  ];

  return (
    <>
      <aside
        className={`fixed left-0 top-0 bottom-0 ${
          isCollapsed ? 'w-20' : 'w-64'
        } bg-sidebar border-r border-white/10 flex flex-col z-40 transition-all duration-300 ease-in-out shadow-2xl select-none`}
      >
      {/* Header con Logo y botón de colapso integrado con el estilo corporativo */}
      <div
        className={`border-b border-white/10 transition-all duration-300 ${
          isCollapsed
            ? 'py-3.5 px-2 flex flex-col items-center gap-2'
            : 'py-5 px-5 flex items-center justify-between'
        }`}
      >
        {isCollapsed ? (
          <>
            <button
              onClick={toggleSidebar}
              className="h-9 w-9 flex items-center justify-center flex-shrink-0 hover:opacity-80 transition-opacity focus:outline-none"
              title="Expandir menú lateral"
            >
              {logoError ? (
                <span className="font-black text-white text-base tracking-wider">4S</span>
              ) : (
                <img
                  src="/logo4sclima.webp"
                  alt="4S Clima"
                  onError={() => setLogoError(true)}
                  className="h-full w-auto object-contain brightness-0 invert"
                />
              )}
            </button>
            {toggleSidebar && (
              <button
                onClick={toggleSidebar}
                className="p-1 rounded-lg text-blue-200/70 hover:text-white hover:bg-white/10 active:bg-white/20 transition-all duration-150 flex items-center justify-center focus:outline-none"
                title="Expandir menú lateral"
              >
                <ChevronRight size={16} />
              </button>
            )}
          </>
        ) : (
          <>
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="h-9 flex items-center justify-center flex-shrink-0">
                {logoError ? (
                  <span className="font-black text-white text-lg tracking-wider">
                    4S <span className="text-brand-300 font-bold text-sm">CLIMA</span>
                  </span>
                ) : (
                  <img
                    src="/logo4sclima.webp"
                    alt="4S Clima"
                    onError={() => setLogoError(true)}
                    className="h-full w-auto object-contain brightness-0 invert"
                  />
                )}
              </div>
              <div className="flex flex-col justify-center min-w-0">
                <p className="text-blue-200 text-[11px] uppercase tracking-wider font-semibold border-l border-white/20 pl-2.5 truncate">
                  Panel Admin
                </p>
              </div>
            </div>

            {toggleSidebar && (
              <button
                onClick={toggleSidebar}
                className="p-1.5 rounded-lg text-blue-200/70 hover:text-white hover:bg-white/10 active:bg-white/20 transition-all duration-150 flex items-center justify-center flex-shrink-0 focus:outline-none"
                title="Achicar menú hacia la izquierda"
              >
                <ChevronLeft size={18} />
              </button>
            )}
          </>
        )}
      </div>

      {/* Navigation */}
      <nav className={`flex-1 ${isCollapsed ? 'px-2 py-2 space-y-2' : 'px-3 py-4 space-y-5'} overflow-y-auto no-scrollbar`}>
        {navGroups.map((group, i) => (
          <div key={i} className={isCollapsed ? 'space-y-0.5' : 'space-y-1'}>
            {isCollapsed ? (
              <div className="my-1 border-t border-white/10 mx-2" title={group.label} />
            ) : (
              <p className="px-3 text-[10px] font-bold tracking-widest text-blue-200/50 uppercase mb-2">
                {group.label}
              </p>
            )}

            {group.items.map(({ to, icon: Icon, label, end, badge, badgeColor = 'amber' }) => {
              const displayBadge = badge > 9 ? '9+' : String(badge);
              const badgeBg = badgeColor === 'rose' ? 'bg-rose-500' : 'bg-amber-500';
              return (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  title={isCollapsed ? (badge > 0 ? `${label} (${badge} pendientes)` : label) : undefined}
                  className={({ isActive }) =>
                    `sidebar-link ${isCollapsed ? 'justify-center px-0 py-2.5' : ''} ${
                      isActive ? 'active' : ''
                    }`
                  }
                >
                  <div className="relative flex items-center justify-center">
                    <Icon size={isCollapsed ? 18 : 18} />
                    {isCollapsed && badge > 0 && (
                      <span className={`absolute -top-1 -right-1 w-2.5 h-2.5 ${badgeBg} rounded-full ring-2 ring-sidebar animate-pulse`} />
                    )}
                  </div>
                  {!isCollapsed && (
                    <div className="flex items-center justify-between flex-1 min-w-0">
                      <span className="truncate">{label}</span>
                      {badge > 0 && (
                        <span className={`ml-2 px-1.5 py-0.5 text-[10px] font-black rounded-full ${badgeBg} text-white shadow-xs`}>
                          {displayBadge}
                        </span>
                      )}
                    </div>
                  )}
                </NavLink>
              );
            })}
          </div>
        ))}
      </nav>

      {/* User info + logout */}
      <div className={`${isCollapsed ? 'px-2 py-2.5' : 'px-3 py-4'} border-t border-white/10`}>

        {isCollapsed ? (
          <div
            className="flex justify-center mb-1.5 py-0.5"
            title={`${displayName} (${displayRole})`}
          >
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm transition-all ${
              isOwner
                ? 'bg-brand-600 text-white font-bold border border-brand-400/40 shadow-sm'
                : 'bg-white/10 text-white font-bold border border-white/15'
            }`}>
              <span className="text-xs">
                {userInitial}
              </span>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3 px-3 py-2.5 mb-2 rounded-xl bg-white/5 border border-white/10">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm transition-all ${
              isOwner
                ? 'bg-brand-600 text-white font-bold border border-brand-400/40 shadow-sm'
                : 'bg-white/10 text-white font-bold border border-white/15'
            }`}>
              <span className="text-xs">
                {userInitial}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white text-xs font-bold truncate leading-tight" title={displayName}>
                {displayName}
              </p>
              <p className="text-blue-200/80 text-[11px] truncate font-medium mt-0.5">
                {isOwner ? 'Owner' : 'Administrador'}
              </p>
            </div>
          </div>
        )}

        <button
          onClick={toggleDarkMode}
          title={isCollapsed ? (isDark ? 'Modo Claro' : 'Modo Oscuro') : undefined}
          className={`sidebar-link w-full text-blue-100 ${isCollapsed ? 'justify-center px-0 py-2 mb-0.5' : 'mb-1'}`}
        >
          {isDark ? <Sun size={isCollapsed ? 18 : 18} /> : <Moon size={isCollapsed ? 18 : 18} />}
          {!isCollapsed && <span>{isDark ? 'Modo Claro' : 'Modo Oscuro'}</span>}
        </button>

        <button
          onClick={logout}
          title={isCollapsed ? 'Cerrar Sesión' : undefined}
          className={`sidebar-link w-full text-blue-100 hover:text-white hover:bg-red-500 ${
            isCollapsed ? 'justify-center px-0 py-2' : ''
          }`}
        >
          <LogOut size={isCollapsed ? 18 : 18} />
          {!isCollapsed && <span>Cerrar Sesión</span>}
        </button>
      </div>
    </aside>

    {/* Toast no invasivo en esquina superior derecha */}
    <AdminNotificationToast toast={toast} onDismiss={dismissToast} />
  </>
  );
}

