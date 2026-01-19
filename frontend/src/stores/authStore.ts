/**
 * Authentication state management
 */

import { create } from 'zustand';
import { authenticate, AuthenticationError } from '../services/api';

interface Identity {
  userId: string;
  displayName: string;
}

interface AuthState {
  // State
  isAuthenticated: boolean;
  isLoading: boolean;
  token: string | null;
  kdfSalt: string | null;
  identity: Identity | null;
  error: string | null;

  // Actions
  login: (words: string) => Promise<{ token: string; kdfSalt: string }>;
  setIdentity: (identity: Identity) => void;
  logout: () => void;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  // Initial state
  isAuthenticated: false,
  isLoading: false,
  token: null,
  kdfSalt: null,
  identity: null,
  error: null,

  // Login action
  login: async (words: string) => {
    console.log('[AuthStore] Starting login...');
    set({ isLoading: true, error: null });

    try {
      const response = await authenticate(words);
      console.log('[AuthStore] Authentication response received');

      set({
        isAuthenticated: true,
        isLoading: false,
        token: response.token,
        kdfSalt: response.kdf_salt
      });
      console.log('[AuthStore] Auth state updated, isAuthenticated = true');

      // Set up token refresh timer
      const refreshTime = (response.expires_in - 60) * 1000; // 1 min before expiry
      setTimeout(() => {
        // In production, implement token refresh
        console.log('Token expiring soon');
      }, refreshTime);

      return {
        token: response.token,
        kdfSalt: response.kdf_salt
      };
    } catch (error) {
      const message = error instanceof AuthenticationError
        ? error.message
        : 'Connection failed';

      console.error('[AuthStore] Login error:', message);
      set({
        isLoading: false,
        error: message
      });

      throw error;
    }
  },

  // Set identity after creation/loading
  setIdentity: (identity: Identity) => {
    set({ identity });
  },

  // Logout action
  logout: () => {
    set({
      isAuthenticated: false,
      token: null,
      kdfSalt: null,
      identity: null,
      error: null
    });
  },

  // Clear error
  clearError: () => {
    set({ error: null });
  }
}));
