import { Routes, Route, Navigate } from 'react-router-dom';
import { create } from 'zustand';
import { supabase } from '@4s-clima/shared/supabase';
import { useEffect } from 'react';

// Layout
import AdminLayout from './components/layout/AdminLayout';

// Pages
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import CalendarPage from './pages/CalendarPage';
import WorkOrdersPage from './pages/WorkOrdersPage';
import ClientsPage from './pages/ClientsPage';
import ClientDetailsPage from './pages/ClientDetailsPage';
import TechniciansPage from './pages/TechniciansPage';
import ExtrasPage from './pages/ExtrasPage';
import FinancesPage from './pages/FinancesPage';

/**
 * Store de auth del admin (inline para simplicidad).
 */
export const useAdminAuth = create((set) => ({
  user: null,
  profile: null,
  isLoading: true,

  initialize: async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      const { data: profile } = await supabase
        .from('users')
        .select('*')
        .eq('id', session.user.id)
        .in('role', ['admin', 'owner'])
        .single();

      if (profile) {
        set({ user: session.user, profile, isLoading: false });
      } else {
        await supabase.auth.signOut();
        set({ user: null, profile: null, isLoading: false });
      }
    } else {
      set({ isLoading: false });
    }

    supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        const { data: profile } = await supabase
          .from('users')
          .select('*')
          .eq('id', session.user.id)
          .in('role', ['admin', 'owner'])
          .single();
        set({ user: session.user, profile: profile || null });
      } else if (event === 'SIGNED_OUT') {
        set({ user: null, profile: null });
      }
    });
  },

  login: async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { success: false, error: error.message };

    const { data: profile } = await supabase
      .from('users')
      .select('*')
      .eq('id', data.user.id)
      .in('role', ['admin', 'owner'])
      .single();

    if (!profile) {
      await supabase.auth.signOut();
      return { success: false, error: 'No tenés permisos de administrador.' };
    }

    if (!profile.active) {
      await supabase.auth.signOut();
      return { success: false, error: 'Tu cuenta ha sido desactivada por el propietario.' };
    }

    set({ user: data.user, profile });
    return { success: true };
  },

  logout: async () => {
    await supabase.auth.signOut();
    set({ user: null, profile: null });
  },
}));

function ProtectedRoute({ children }) {
  const { user, isLoading } = useAdminAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-gray-400 text-sm">Cargando panel...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return children;
}

export default function App() {
  const initialize = useAdminAuth((s) => s.initialize);

  useEffect(() => {
    initialize();
  }, [initialize]);

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <ProtectedRoute>
            <AdminLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="calendario" element={<CalendarPage />} />
        <Route path="ordenes" element={<WorkOrdersPage />} />
        <Route path="clientes" element={<ClientsPage />} />
        <Route path="clientes/:id" element={<ClientDetailsPage />} />
        <Route path="tecnicos" element={<TechniciansPage />} />
        <Route path="extras" element={<ExtrasPage />} />
        <Route path="finanzas" element={<FinancesPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
