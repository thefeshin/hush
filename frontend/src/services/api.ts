/**
 * API service for backend communication
 * All requests include credentials for cookie-based auth
 */

const API_BASE = '/api';

interface User {
  id: string;
  username: string;
}

interface VaultResponse {
  vault_token: string;
  kdf_salt: string;
  expires_in: number;
}

interface AuthSuccess {
  user: User;
  message: string;
}

interface UserLookupResponse {
  found: boolean;
  user: User | null;
}

/**
 * Custom error for authentication failures
 */
export class AuthenticationError extends Error {
  constructor(
    public code: string,
    public message: string,
    public remainingAttempts?: number
  ) {
    super(message);
    this.name = 'AuthenticationError';
  }
}

/**
 * Verify 12-word passphrase and get vault token
 */
export async function verifyVault(words: string): Promise<VaultResponse> {
  const response = await fetch(`${API_BASE}/auth/vault`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ words }),
    credentials: 'include'
  });

  if (!response.ok) {
    const error = await response.json();
    throw new AuthenticationError(
      error.detail?.error || 'auth_failed',
      error.detail?.message || 'Authentication failed',
      error.detail?.remaining_attempts
    );
  }

  return response.json();
}

/**
 * Register a new user
 */
export async function register(vaultToken: string, username: string, password: string): Promise<AuthSuccess> {
  const response = await fetch(`${API_BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ vault_token: vaultToken, username, password }),
    credentials: 'include'
  });

  if (!response.ok) {
    const error = await response.json();
    throw new AuthenticationError(
      error.detail?.error || 'registration_failed',
      error.detail?.message || 'Registration failed'
    );
  }

  return response.json();
}

/**
 * Login an existing user
 */
export async function login(vaultToken: string, username: string, password: string): Promise<AuthSuccess> {
  const response = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ vault_token: vaultToken, username, password }),
    credentials: 'include'
  });

  if (!response.ok) {
    const error = await response.json();
    throw new AuthenticationError(
      error.detail?.error || 'login_failed',
      error.detail?.message || 'Login failed'
    );
  }

  return response.json();
}

/**
 * Refresh tokens
 */
export async function refreshToken(): Promise<AuthSuccess> {
  const response = await fetch(`${API_BASE}/auth/refresh`, {
    method: 'POST',
    credentials: 'include'
  });

  if (!response.ok) {
    throw new AuthenticationError('refresh_failed', 'Session expired');
  }

  return response.json();
}

/**
 * Logout user
 */
export async function logout(): Promise<void> {
  await fetch(`${API_BASE}/auth/logout`, {
    method: 'POST',
    credentials: 'include'
  });
}

/**
 * Get current user
 */
export async function getCurrentUser(): Promise<User> {
  const response = await fetch(`${API_BASE}/auth/me`, {
    credentials: 'include'
  });

  if (!response.ok) {
    throw new AuthenticationError('not_authenticated', 'Not authenticated');
  }

  return response.json();
}

/**
 * Lookup user by username
 */
export async function lookupUser(username: string): Promise<UserLookupResponse> {
  const response = await fetch(`${API_BASE}/users/lookup?username=${encodeURIComponent(username)}`, {
    credentials: 'include'
  });

  if (!response.ok) {
    if (response.status === 401) {
      throw new AuthenticationError('not_authenticated', 'Not authenticated');
    }
    throw new Error('User lookup failed');
  }

  return response.json();
}

/**
 * Get KDF salt (public endpoint)
 */
export async function getSalt(): Promise<string> {
  const response = await fetch(`${API_BASE}/auth/salt`);
  if (!response.ok) {
    throw new Error('Failed to fetch salt');
  }
  const data = await response.json();
  return data.kdf_salt;
}

/**
 * Discover all conversations for the authenticated user
 */
export async function discoverConversations(): Promise<string[]> {
  const response = await fetch(`${API_BASE}/conversations/discover`, {
    credentials: 'include'
  });

  if (!response.ok) {
    if (response.status === 401) {
      throw new AuthenticationError('not_authenticated', 'Not authenticated');
    }
    throw new Error('Failed to discover conversations');
  }

  const data = await response.json();
  return data.conversation_ids;
}

/**
 * Create authenticated fetch function with automatic token refresh
 */
export function createAuthenticatedFetch() {
  return async function authFetch(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<Response> {
    let response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      credentials: 'include'
    });

    // If unauthorized, try to refresh token
    if (response.status === 401) {
      try {
        await refreshToken();
        // Retry original request
        response = await fetch(`${API_BASE}${endpoint}`, {
          ...options,
          credentials: 'include'
        });
      } catch {
        // Refresh failed, return original 401 response
      }
    }

    return response;
  };
}

// Legacy export for backward compatibility
export async function authenticate(words: string): Promise<{ token: string; kdf_salt: string; expires_in: number }> {
  const response = await verifyVault(words);
  return {
    token: response.vault_token,
    kdf_salt: response.kdf_salt,
    expires_in: response.expires_in
  };
}
