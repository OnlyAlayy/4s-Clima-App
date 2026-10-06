import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail, Lock, Eye, EyeOff, Snowflake } from 'lucide-react';
import { useAuthStore } from '../stores/authStore';

/**
 * Página de Login del técnico.
 * UI oscura premium con campo de email + contraseña.
 */
export default function LoginPage() {
  const navigate = useNavigate();
  const { login, user, isLoading, error, clearError } = useAuthStore();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Si ya hay sesión, redirigir al dashboard
  useEffect(() => {
    if (user) navigate('/', { replace: true });
  }, [user, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email || !password) return;

    setIsSubmitting(true);
    clearError();

    const result = await login(email, password);
    setIsSubmitting(false);

    if (result.success) {
      navigate('/', { replace: true });
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 bg-surface-dark">
      {/* Logo y marca */}
      <div className="flex flex-col items-center mb-10 animate-fade-in">
        <div className="h-16 flex items-center justify-center mb-2">
          <img src="/logo4sclima.webp" alt="4S Clima Logo" className="h-full w-auto object-contain brightness-0 invert" />
        </div>
        <p className="text-gray-500 text-sm mt-1 uppercase tracking-widest font-semibold">Panel del Técnico</p>
      </div>

      {/* Formulario */}
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm space-y-4 animate-slide-up"
      >
        {/* Error */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-red-400 text-sm text-center">
            {error === 'Invalid login credentials'
              ? 'Email o contraseña incorrectos'
              : error}
          </div>
        )}

        {/* Email */}
        <div className="relative">
          <Mail
            size={18}
            className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500"
          />
          <input
            id="login-email"
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="input pl-11"
            autoComplete="email"
            required
          />
        </div>

        {/* Contraseña */}
        <div className="relative">
          <Lock
            size={18}
            className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500"
          />
          <input
            id="login-password"
            type={showPassword ? 'text' : 'password'}
            placeholder="Contraseña"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="input pl-11 pr-11"
            autoComplete="current-password"
            required
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 active:text-gray-600"
            aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
          >
            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>

        {/* Botón submit */}
        <button
          id="login-submit"
          type="submit"
          disabled={isSubmitting || isLoading}
          className="btn-primary w-full text-base"
        >
          {isSubmitting ? (
            <>
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Ingresando...
            </>
          ) : (
            'Ingresar'
          )}
        </button>
      </form>

      {/* Footer */}
      <p className="text-gray-600 text-xs mt-10">
        © {new Date().getFullYear()} 4S Clima — v1.0
      </p>
    </div>
  );
}
