/**
 * Authentication state management for multi-user system
 */

import { create } from 'zustand';

export interface User {
  id: string;
  username: string;
}

interface AuthState {
  // State
  isAuthenticated: boolean;
  isLoading: boolean;
  user: User | null;
  kdfSalt: string | null;
  error: string | null;

  // Actions
  setUser: (user: User) => void;
  setKdfSalt: (salt: string) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  logout: () => Promise<void>;
  checkAuth: () => Promise<User | null>;
  refreshToken: () => Promise<boolean>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  // Initial state
  isAuthenticated: false,
  isLoading: false,
  user: null,
  kdfSalt: null,
  error: null,

  setUser: (user: User) => {
    set({ user, isAuthenticated: true, isLoading: false, error: null });
  },

  setKdfSalt: (salt: string) => {
    set({ kdfSalt: salt });
  },

  setLoading: (loading: boolean) => {
    set({ isLoading: loading });
  },

  setError: (error: string | null) => {
    set({ error, isLoading: false });
  },

  logout: async () => {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include'
      });
    } catch {
      // Ignore logout errors
    }

    set({
      isAuthenticated: false,
      user: null,
      kdfSalt: null,
      error: null,
      isLoading: false
    });
  },

  checkAuth: async () => {
    try {
      const response = await fetch('/api/auth/me', {
        credentials: 'include'
      });

      if (response.ok) {
        const user = await response.json();
        set({ user, isAuthenticated: true });
        return user;
      }

      // Try to refresh if access token expired
      if (response.status === 401) {
        const refreshed = await get().refreshToken();
        if (refreshed) {
          return get().user;
        }
      }

      set({ isAuthenticated: false, user: null });
      return null;
    } catch {
      set({ isAuthenticated: false, user: null });
      return null;
    }
  },

  refreshToken: async () => {
    try {
      const response = await fetch('/api/auth/refresh', {
        method: 'POST',
        credentials: 'include'
      });

      if (response.ok) {
        const data = await response.json();
        set({ user: data.user, isAuthenticated: true });
        return true;
      }

      set({ isAuthenticated: false, user: null });
      return false;
    } catch {
      set({ isAuthenticated: false, user: null });
      return false;
    }
  }
}));
