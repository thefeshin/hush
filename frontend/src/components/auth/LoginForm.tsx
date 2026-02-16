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
  const inputClassName = 'w-full rounded-lg border border-border bg-bg-primary px-4 py-3 text-body text-text-primary outline-none focus:border-accent';
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
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl bg-bg-secondary p-8 shadow-[0_4px_20px_rgba(0,0,0,0.3)]">
        <div>
          <h1 className="text-center text-display font-black tracking-[0.5rem] text-accent">HUSH</h1>
          <p className="mb-8 text-center text-text-secondary">Welcome Back</p>
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
              placeholder="Enter your username"
              disabled={isLoading}
              autoComplete="username"
              autoCapitalize="off"
              className={inputClassName}
            />
          </div>

          <div className="mb-4">
            <label htmlFor="password" className="mb-2 block font-medium">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              disabled={isLoading}
              autoComplete="current-password"
              className={inputClassName}
            />
          </div>

          {error && (
            <div className="mb-4 rounded-lg border border-error bg-zinc-900 p-3 text-body text-text-secondary">
              {error}
            </div>
          )}

          <button
            type="submit"
            className="w-full cursor-pointer rounded-lg border-0 bg-accent px-4 py-4 text-body font-semibold text-zinc-900 transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
            disabled={isLoading || !isValid}
          >
            {isLoading ? 'Logging in...' : 'Login'}
          </button>
        </form>

        <div className="mt-6 border-t border-border pt-6 text-center">
          <p className="mb-2 text-body text-text-secondary">Don't have an account?</p>
          <button
            type="button"
            className="cursor-pointer border-0 bg-transparent text-body text-accent underline hover:text-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
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
