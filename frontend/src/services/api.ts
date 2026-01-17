/**
 * API service for backend communication
 */

const API_BASE = '/api';

interface AuthResponse {
  token: string;
  kdf_salt: string;
  expires_in: number;
}

interface AuthError {
  error: string;
  remaining_attempts?: number;
}

/**
 * Custom error for authentication failures
 */
export class AuthenticationError extends Error {
  constructor(
    public code: string,
    public remainingAttempts?: number
  ) {
    super(
      code === 'invalid_credentials'
        ? `Invalid passphrase. ${remainingAttempts ?? 0} attempts remaining.`
        : code === 'ip_blocked'
          ? 'Access blocked. Too many failed attempts.'
          : 'Authentication failed.'
    );
    this.name = 'AuthenticationError';
  }
}

/**
 * Authenticate with 12-word passphrase
 */
export async function authenticate(words: string): Promise<AuthResponse> {
  const response = await fetch(`${API_BASE}/auth`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ words })
  });

  if (!response.ok) {
    const error: AuthError = await response.json();
    throw new AuthenticationError(
      error.error,
      error.remaining_attempts
    );
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
 * Create authenticated fetch function
 */
export function createAuthenticatedFetch(token: string) {
  return async function authFetch(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<Response> {
    const headers = new Headers(options.headers);
    headers.set('Authorization', `Bearer ${token}`);

    return fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers
    });
  };
}
