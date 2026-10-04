import { useState, useEffect } from 'react';
import { X, UserPlus, Eye, EyeOff } from 'lucide-react';
import { supabase } from '@4s-clima/shared/supabase';

export default function CreateTechnicianModal({ isOpen, onClose, onCreated, isOwner }) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // Form state
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [role, setRole] = useState('tecnico');

  useEffect(() => {
    if (isOpen) {
      resetForm();
    }
  }, [isOpen]);

  const resetForm = () => {
    setName('');
    setEmail('');
    setPassword(generateRandomPassword());
    setPhone('');
    setShowPassword(false);
    setRole('tecnico');
    setError(null);
  };

  const generateRandomPassword = () => {
    const array = new Uint8Array(6);
    window.crypto.getRandomValues(array);
    return Array.from(array).map(b => b.toString(16).padStart(2, '0')).join('') + '4S';
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!name || !email || !password) {
      setError('Nombre, email y contraseña son obligatorios.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      // Llamada segura a la Edge Function
      const res = await supabase.functions.invoke('create-user', {
        body: { 
          email, 
          password, 
          name, 
          phone: phone || null, 
          role 
        }
      });

      if (res.error) {
        // Tratar de sacar el error real que viene del servidor
        let errMsg = res.error.message || 'Error al conectar con el servidor.';
        
        // Supabase-js a veces oculta el cuerpo del error 400. 
        // Vamos a intentar parsearlo si viene en context
        try {
          if (res.error.context && typeof res.error.context.json === 'function') {
             const errorData = await res.error.context.json();
             if (errorData?.error) errMsg = errorData.error;
          }
        } catch(e) {}
        
        throw new Error(errMsg);
      }

      if (res.data?.error) {
        throw new Error(res.data.error);
      }

      // Todo salió bien
      onCreated();
      onClose();
    } catch (err) {
      console.error('Error creando usuario:', err);
      setError(err.message || 'Ocurrió un error al crear el usuario.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-2xl shadow-elevated w-full max-w-md max-h-[90vh] overflow-hidden flex flex-col animate-slide-up">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center">
            <UserPlus size={20} className="text-brand-500" />
          </div>
          <div className="flex-1">
            <h2 className="text-xl font-bold text-gray-900">Nuevo Usuario</h2>
            <p className="text-gray-500 text-xs">Dar de alta a un empleado</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full text-gray-500 transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto">
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-100 text-red-600 rounded-xl text-sm">
              {error}
            </div>
          )}

          <form id="create-user-form" onSubmit={handleSubmit} className="space-y-4">
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nombre Completo *</label>
              <input 
                type="text" 
                className="input" 
                placeholder="Ej: Juan Pérez"
                value={name} 
                onChange={(e) => setName(e.target.value)}
                required 
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email Profesional *</label>
              <input 
                type="email" 
                className="input" 
                placeholder="juan@4sclima.com"
                value={email} 
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="new-email"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Contraseña (Generada automáticamente) *</label>
              <div className="relative">
                <input 
                  type={showPassword ? 'text' : 'password'}
                  className="input pr-10" 
                  value={password} 
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-1">Copiá esta contraseña y pasásela al técnico para su primer ingreso.</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Teléfono (Opcional)</label>
              <input 
                type="tel" 
                className="input" 
                placeholder="Ej: 11-1234-5678"
                value={phone} 
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Rol / Permisos *</label>
              <select 
                className="select disabled:opacity-75 disabled:bg-gray-100" 
                value={role} 
                onChange={(e) => setRole(e.target.value)}
                disabled={!isOwner}
              >
                <option value="tecnico">Técnico (Solo app celular)</option>
                {isOwner && <option value="admin">Administrador (Panel Web)</option>}
              </select>
              {!isOwner && (
                <p className="text-xs text-gray-500 mt-1">Solo el dueño puede crear otros administradores.</p>
              )}
            </div>

          </form>
        </div>

        {/* Footer */}
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
            form="create-user-form" 
            type="submit" 
            className="btn-primary"
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Creando...' : 'Crear Usuario'}
          </button>
        </div>
      </div>
    </div>
  );
}
