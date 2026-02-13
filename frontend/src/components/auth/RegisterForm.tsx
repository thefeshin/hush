/**
 * Register Form - Step 2b of authentication
 * Create new account after vault verification
 */

import React, { useState, useRef, useEffect } from 'react';

interface User {
  id: string;
  username: string;
}

interface Props {
  vaultToken: string;
  onSuccess: (user: User) => void;
  onSwitchToLogin: () => void;
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
}

export function RegisterForm({ vaultToken, onSuccess, onSwitchToLogin, isLoading, setIsLoading }: Props) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const usernameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    usernameRef.current?.focus();
  }, []);

  const validateUsername = (value: string): string | null => {
    const trimmed = value.toLowerCase().trim();
    if (trimmed.length < 3) return 'Username must be at least 3 characters';
    if (trimmed.length > 50) return 'Username must be 50 characters or less';
    if (!/^[a-z0-9_]+$/.test(trimmed)) return 'Only lowercase letters, numbers, and underscores';
    if (trimmed.startsWith('_') || trimmed.endsWith('_')) return 'Cannot start or end with underscore';
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const usernameError = validateUsername(username);
    if (usernameError) {
      setError(usernameError);
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch('/api/auth/register', {
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
        throw new Error(data.detail?.message || 'Registration failed');
      }

      const data = await response.json();
      onSuccess(data.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed');
      setIsLoading(false);
    }
  };

  const usernameError = username.length > 0 ? validateUsername(username) : null;
  const passwordError = password.length > 0 && password.length < 8 ? 'Min 8 characters' : null;
  const confirmError = confirmPassword.length > 0 && password !== confirmPassword ? 'Passwords do not match' : null;
  const isValid = !validateUsername(username) && password.length >= 8 && password === confirmPassword;

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="logo">
          <h1>HUSH</h1>
          <p className="tagline">Create Your Account</p>
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
              placeholder="Choose a username"
              disabled={isLoading}
              autoComplete="username"
              autoCapitalize="off"
            />
            {usernameError && <span className="field-error">{usernameError}</span>}
            <span className="field-hint">Letters, numbers, underscores only</span>
          </div>

          <div className="input-group">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Choose a password"
              disabled={isLoading}
              autoComplete="new-password"
            />
            {passwordError && <span className="field-error">{passwordError}</span>}
          </div>

          <div className="input-group">
            <label htmlFor="confirmPassword">Confirm Password</label>
            <input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm your password"
              disabled={isLoading}
              autoComplete="new-password"
            />
            {confirmError && <span className="field-error">{confirmError}</span>}
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
            {isLoading ? 'Creating Account...' : 'Create Account'}
          </button>
        </form>

        <div className="auth-switch">
          <p>Already have an account?</p>
          <button
            type="button"
            className="link-button"
            onClick={onSwitchToLogin}
            disabled={isLoading}
          >
            Login
          </button>
        </div>
      </div>
    </div>
  );
}
