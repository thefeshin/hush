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
  const inputClassName = 'w-full rounded-lg border border-border bg-bg-primary px-4 py-3 text-base text-text-primary outline-none focus:border-accent';
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
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl bg-bg-secondary p-8 shadow-[0_4px_20px_rgba(0,0,0,0.3)]">
        <div>
          <h1 className="text-center text-[2.5rem] font-black tracking-[0.5rem] text-accent">HUSH</h1>
          <p className="mb-8 text-center text-text-secondary">Create Your Account</p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label htmlFor="username" className="mb-2 block font-medium">Username</label>
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
              className={inputClassName}
            />
            {usernameError && <span className="mt-1 block text-xs text-error">{usernameError}</span>}
            <span className="mt-1 block text-xs text-text-secondary">Letters, numbers, underscores only</span>
          </div>

          <div className="mb-4">
            <label htmlFor="password" className="mb-2 block font-medium">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Choose a password"
              disabled={isLoading}
              autoComplete="new-password"
              className={inputClassName}
            />
            {passwordError && <span className="mt-1 block text-xs text-error">{passwordError}</span>}
          </div>

          <div className="mb-4">
            <label htmlFor="confirmPassword" className="mb-2 block font-medium">Confirm Password</label>
            <input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm your password"
              disabled={isLoading}
              autoComplete="new-password"
              className={inputClassName}
            />
            {confirmError && <span className="mt-1 block text-xs text-error">{confirmError}</span>}
          </div>

          {error && (
            <div className="mb-4 rounded-lg border border-error bg-error/10 p-3 text-sm text-error">
              {error}
            </div>
          )}

          <button
            type="submit"
            className="w-full cursor-pointer rounded-lg border-0 bg-accent px-4 py-4 text-base font-semibold text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
            disabled={isLoading || !isValid}
          >
            {isLoading ? 'Creating Account...' : 'Create Account'}
          </button>
        </form>

        <div className="mt-6 border-t border-border pt-6 text-center">
          <p className="mb-2 text-sm text-text-secondary">Already have an account?</p>
          <button
            type="button"
            className="cursor-pointer border-0 bg-transparent text-sm text-accent underline hover:text-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
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
