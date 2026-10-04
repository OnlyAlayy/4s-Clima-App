import { create } from 'zustand';
import { supabase } from '@4s-clima/shared/supabase';
import { clearLocalDatabase } from '../services/offlineDb';

/**
 * Store de autenticación con Zustand.
 * Maneja login, logout, sesión persistente y perfil del usuario.
 */
export const useAuthStore = create((set, get) => ({
  user: null,
  profile: null,
  isLoading: true,
  error: null,

  /**
   * Inicializa la sesión. Se llama una vez al montar la app.
   * Escucha cambios de auth de Supabase (login, logout, token refresh).
   * Tiene un timeout de 5 segundos para no quedarse cargando infinito.
   */
  initialize: async () => {
    try {
      // Timeout de 5 segundos para no quedarse en "Cargando..." infinito
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Timeout conectando a Supabase')), 5000)
      );

      const sessionPromise = supabase.auth.getSession();

      const { data: { session } } = await Promise.race([sessionPromise, timeoutPromise]);
      
      if (session?.user) {
        const profile = await get().fetchProfile(session.user.id);
        
        if (profile && !profile.active) {
          await get().logout();
          set({ isLoading: false, error: 'Tu cuenta ha sido desactivada por un administrador.' });
        } else {
          set({ user: session.user, profile, isLoading: false });
        }
      } else {
        set({ user: null, profile: null, isLoading: false });
      }

      // Escuchar cambios de auth
      supabase.auth.onAuthStateChange(async (event, session) => {
        if (event === 'SIGNED_IN' && session?.user) {
          const profile = await get().fetchProfile(session.user.id);
          if (profile && !profile.active) {
            await get().logout();
            set({ error: 'Tu cuenta ha sido desactivada.' });
          } else {
            set({ user: session.user, profile });
          }
        } else if (event === 'SIGNED_OUT') {
          await clearLocalDatabase().catch(console.warn);
          set({ user: null, profile: null });
        }
      });
    } catch (error) {
      console.warn('Auth init:', error.message);
      // Si falla o hay timeout, mostrar el login igual
      set({ isLoading: false, user: null, profile: null });
    }
  },

  /**
   * Obtiene el perfil del usuario desde la tabla `users`.
   */
  fetchProfile: async (userId) => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error obteniendo perfil:', error);
      return null;
    }
  },

  login: async (email, password) => {
    set({ isLoading: true, error: null });
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;

      const profile = await get().fetchProfile(data.user.id);
      
      if (profile && !profile.active) {
        await get().logout();
        throw new Error('Tu cuenta ha sido desactivada por un administrador.');
      }

      set({ user: data.user, profile, isLoading: false });
      return { success: true };
    } catch (error) {
      set({ isLoading: false, error: error.message });
      return { success: false, error: error.message };
    }
  },

  /**
   * Cierra la sesión.
   * Evita cerrar sesión si hay datos pendientes de sincronizar, a menos que se force.
   */
  logout: async (force = false) => {
    let shouldClear = true;
    try {
      const { db } = await import('../services/offlineDb');
      const pendingCount = await db.pendingSync.count();
      if (pendingCount > 0 && !force) {
        shouldClear = false;
        throw new Error('Tienes datos offline sin sincronizar. Conéctate a internet para sincronizar antes de salir.');
      }
      
      await supabase.auth.signOut();
    } catch (error) {
      if (error.message.includes('datos offline sin sincronizar')) {
        throw error;
      }
      console.warn('Error en signOut de Supabase:', error);
    } finally {
      if (shouldClear) {
        set({ user: null, profile: null });
        await clearLocalDatabase().catch(console.warn);
      }
    }
  },

  /**
   * Limpia los errores.
   */
  clearError: () => set({ error: null }),
}));
