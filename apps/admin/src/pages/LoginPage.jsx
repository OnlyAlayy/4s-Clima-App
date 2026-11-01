import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail, Lock, Eye, EyeOff } from 'lucide-react';
import { useAdminAuth } from '../App';

/**
 * Login del panel administrativo.
 * Estilo visual oscuro idéntico al panel del técnico.
 */
export default function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAdminAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email || !password) return;

    setIsSubmitting(true);
    setError('');

    const result = await login(email, password);
    setIsSubmitting(false);

    if (result.success) {
      navigate('/', { replace: true });
    } else {
      setError(
        result.error === 'Invalid login credentials'
          ? 'Email o contraseña incorrectos'
          : result.error
      );
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 bg-gray-50 dark:bg-slate-950 transition-colors">
      {/* Logo y marca */}
      <div className="flex flex-col items-center mb-10 animate-fade-in">
        <div className="h-16 flex items-center justify-center mb-2">
          <img
            src="/logo4sclima.webp"
            alt="4S Clima Logo"
            className="h-full w-auto object-contain dark:brightness-0 dark:invert"
          />
        </div>
        <p className="text-gray-500 dark:text-gray-400 text-sm mt-1 uppercase tracking-widest font-semibold">
          Panel de Gestión
        </p>
      </div>

      {/* Formulario */}
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm space-y-4 animate-slide-up"
      >
        {/* Error */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-red-400 text-sm text-center">
            {error}
          </div>
        )}

        {/* Email */}
        <div className="relative">
          <Mail
            size={18}
            className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500"
          />
          <input
            id="admin-login-email"
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
            id="admin-login-password"
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
            className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-400 active:text-gray-300"
            aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
          >
            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>

        {/* Botón submit */}
        <button
          id="admin-login-submit"
          type="submit"
          disabled={isSubmitting}
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
      <p className="text-gray-600 dark:text-gray-400 text-xs mt-10 text-center">
        © {new Date().getFullYear()} 4S Clima — Acceso exclusivo para administradores
      </p>
    </div>
  );
}
