import { Routes, Route, Navigate } from 'react-router-dom';
import { useEffect } from 'react';
import { Toaster } from 'react-hot-toast';
import { useAuthStore } from './stores/authStore';
import { useOnlineStatus } from './hooks/useOnlineStatus';
import { useRealtimeNotifications } from './hooks/useRealtimeNotifications';
import { WifiOff } from 'lucide-react';

// Layout
import AppLayout from './components/layout/AppLayout';

// Pages
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import WorkOrderPage from './pages/WorkOrderPage';
import ChecklistPage from './pages/ChecklistPage';
import PhotosPage from './pages/PhotosPage';
import SignaturePage from './pages/SignaturePage';
import ProfilePage from './pages/ProfilePage';
import ExtrasPage from './pages/ExtrasPage';

/**
 * Componente de ruta protegida.
 * Redirige al login si no hay sesión activa.
 */
function ProtectedRoute({ children }) {
  const { user, isLoading } = useAuthStore();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-gray-500 text-sm font-semibold">Cargando...</p>
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
  const isOnline = useOnlineStatus();
  const initialize = useAuthStore((s) => s.initialize);
  const profile = useAuthStore((s) => s.profile);

  // Inicializar auth al montar la app
  useEffect(() => {
    initialize();
  }, [initialize]);

  // Hook para notificaciones push en tiempo real
  useRealtimeNotifications(profile);

  return (
    <>
      <Toaster position="top-center" reverseOrder={false} />
      
      {/* Banner de offline */}
      {!isOnline && (
        <div className="offline-banner flex items-center justify-center gap-2">
          <WifiOff size={14} />
          <span>Sin conexión — Los datos se guardarán localmente</span>
        </div>
      )}

      <Routes>
        {/* Ruta pública */}
        <Route path="/login" element={<LoginPage />} />

        {/* Rutas protegidas con layout */}
        <Route
          element={
            <ProtectedRoute>
              <AppLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<DashboardPage />} />
          <Route path="orden/:id" element={<WorkOrderPage />} />
          <Route path="orden/:id/extras" element={<ExtrasPage />} />
          <Route path="orden/:id/checklist" element={<ChecklistPage />} />
          <Route path="orden/:id/fotos" element={<PhotosPage />} />
          <Route path="orden/:id/firma" element={<SignaturePage />} />
          <Route path="perfil" element={<ProfilePage />} />
        </Route>

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
