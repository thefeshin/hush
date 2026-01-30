/**
 * Login Form - Step 2a of authentication
 * Login with username/password after vault verification
 */

import React, { useState, useRef, useEffect } from 'react';

interface User {
  id: string;
  username: string;
}

interface Props {
  vaultToken: string;
  onSuccess: (user: User) => void;
  onSwitchToRegister: () => void;
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
}

export function LoginForm({ vaultToken, onSuccess, onSwitchToRegister, isLoading, setIsLoading }: Props) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const usernameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    usernameRef.current?.focus();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vault_token: vaultToken,
          username: username.toLowerCase().trim(),
          password
        }),
        credentials: 'include'
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.detail?.message || 'Login failed');
      }

      const data = await response.json();
      onSuccess(data.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
      setIsLoading(false);
    }
  };

  const isValid = username.trim().length >= 3 && password.length >= 1;

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="logo">
          <h1>HUSH</h1>
          <p className="tagline">Welcome Back</p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="input-group">
            <label htmlFor="username">Username</label>
            <input
              ref={usernameRef}
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter your username"
              disabled={isLoading}
              autoComplete="username"
              autoCapitalize="off"
            />
          </div>

          <div className="input-group">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              disabled={isLoading}
              autoComplete="current-password"
            />
          </div>

          {error && (
            <div className="error-message">
              {error}
            </div>
          )}

          <button
            type="submit"
            className="primary-button"
            disabled={isLoading || !isValid}
          >
            {isLoading ? 'Logging in...' : 'Login'}
          </button>
        </form>

        <div className="auth-switch">
          <p>Don't have an account?</p>
          <button
            type="button"
            className="link-button"
            onClick={onSwitchToRegister}
            disabled={isLoading}
          >
            Create Account
          </button>
        </div>
      </div>
    </div>
  );
}
