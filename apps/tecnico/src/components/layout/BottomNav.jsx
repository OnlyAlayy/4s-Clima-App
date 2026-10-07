import { NavLink } from 'react-router-dom';
import { ClipboardList, User, Home, QrCode } from 'lucide-react';

/**
 * Barra de navegación inferior para la PWA del técnico.
 * 3 tabs: Inicio, Escáner, Perfil.
 * Diseñada con botones grandes para uso con guantes / dedos sucios.
 */
export default function BottomNav() {
  const navItems = [
    { to: '/', icon: Home, label: 'Inicio' },
    { to: '/escaner', icon: QrCode, label: 'Escáner' },
    { to: '/perfil', icon: User, label: 'Perfil' },
  ];

  return (
    <nav className="bottom-nav">
      <div className="flex items-center justify-around max-w-lg mx-auto">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex flex-col items-center gap-1 py-2 px-4 rounded-xl
               transition-all duration-200 min-w-[72px]
               ${isActive
                 ? 'text-brand-600'
                 : 'text-gray-400 active:text-gray-600 hover:text-gray-500'
               }`
            }
          >
            {({ isActive }) => (
              <>
                <div className="relative">
                  {isActive && (
                    <div className="absolute -inset-2 bg-brand-50 dark:bg-brand-900/30 rounded-full" />
                  )}
                  <Icon
                    size={24}
                    strokeWidth={isActive ? 2.5 : 2}
                    className="relative z-10"
                  />
                </div>
                <span className={`text-[10px] font-medium ${isActive ? 'font-bold' : ''}`}>
                  {label}
                </span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
