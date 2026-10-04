import { useState, useEffect } from 'react';
import { X, KeyRound, Eye, EyeOff } from 'lucide-react';
import { supabase } from '@4s-clima/shared/supabase';

export default function ChangePasswordModal({ isOpen, onClose, user }) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setPassword('');
      setShowPassword(false);
      setError(null);
      setSuccess(false);
    }
  }, [isOpen]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres.');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setSuccess(false);

    try {
      // Llamamos a la Edge Function segura en lugar de usar la clave maestra directamente
      const { data, error: functionError } = await supabase.functions.invoke('update-password', {
        body: {
          userId: user.id,
          newPassword: password
        },
      });

      if (functionError) throw functionError;
      if (data?.error) throw new Error(data.error);
      
      setSuccess(true);
      setTimeout(() => {
        onClose();
      }, 2000);
    } catch (err) {
      console.error('Error cambiando contraseña:', err);
      // Extraemos el mensaje de error de la función si existe
      let errMsg = err.message || 'Ocurrió un error al cambiar la contraseña.';
      
      try {
        if (err.context && err.context.json) {
          const parsed = JSON.parse(err.context.json);
          if (parsed.error) errMsg = parsed.error;
        }
      } catch (e) {}

      setError(errMsg);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen || !user) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-2xl shadow-elevated w-full max-w-md overflow-hidden flex flex-col animate-slide-up">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center">
            <KeyRound size={20} className="text-amber-500" />
          </div>
          <div className="flex-1">
            <h2 className="text-xl font-bold text-gray-900">Cambiar Contraseña</h2>
            <p className="text-gray-500 text-xs truncate">Para: {user.name} ({user.email})</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full text-gray-500 transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="p-6">
          {error && (
            <div className="mb-4 p-4 bg-red-50 border border-red-100 text-red-600 rounded-xl text-sm">
              {error}
            </div>
          )}
          
          {success ? (
            <div className="p-6 bg-emerald-50 border border-emerald-100 text-emerald-700 rounded-xl text-center">
              <KeyRound size={32} className="mx-auto mb-2 text-emerald-500" />
              <p className="font-semibold">¡Contraseña actualizada!</p>
              <p className="text-sm mt-1">El usuario ya puede iniciar sesión con la nueva clave.</p>
            </div>
          ) : (
            <form id="change-password-form" onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nueva Contraseña</label>
                <div className="relative">
                  <input 
                    type={showPassword ? 'text' : 'password'}
                    className="input pr-10" 
                    placeholder="Mínimo 6 caracteres"
                    value={password} 
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={6}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
            </form>
          )}
        </div>

        {/* Footer */}
        {!success && (
          <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex justify-end gap-3 rounded-b-2xl">
            <button 
              type="button" 
              onClick={onClose} 
              className="btn-secondary"
              disabled={isSubmitting}
            >
              Cancelar
            </button>
            <button 
              form="change-password-form" 
              type="submit" 
              className="btn-primary"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Guardando...' : 'Cambiar Contraseña'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
