import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail, Lock, Eye, EyeOff, Snowflake } from 'lucide-react';
import { useAdminAuth } from '../App';

/**
 * Login del panel administrativo.
 * Solo permite acceso a usuarios con role='admin'.
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
    <div className="min-h-screen flex items-center justify-center bg-brand-900 px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="h-16 flex items-center justify-center mx-auto mb-2">
            <img src="/logo4sclima.webp" alt="4S Clima Logo" className="h-full w-auto object-contain brightness-0 invert" />
          </div>
          <p className="text-gray-400 text-sm mt-1 uppercase tracking-widest font-semibold">Panel de Gestión</p>
        </div>

        {/* Form card */}
        <div className="card p-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-6 text-center">
            Iniciar Sesión
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-red-600 text-sm text-center">
                {error}
              </div>
            )}

            <div className="relative">
              <Mail size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                id="admin-login-email"
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input pl-10"
                required
              />
            </div>

            <div className="relative">
              <Lock size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                id="admin-login-password"
                type={showPassword ? 'text' : 'password'}
                placeholder="Contraseña"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input pl-10 pr-10"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>

            <button
              id="admin-login-submit"
              type="submit"
              disabled={isSubmitting}
              className="btn-primary w-full py-3"
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
        </div>

        <p className="text-gray-600 text-xs text-center mt-6">
          © {new Date().getFullYear()} 4S Clima — Acceso exclusivo para administradores
        </p>
      </div>
    </div>
  );
}
