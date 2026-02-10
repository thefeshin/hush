/**
 * Vault Entry - Step 1 of authentication
 * Enter 12-word passphrase to verify vault access
 */

import React, { useState, useRef, useEffect } from 'react';
import { validateWordCount } from '../../crypto/normalize';
import { setSessionVaultKey } from '../../services/vaultStorage';
import { deriveVaultKey } from '../../crypto/kdf';
import type { VaultKey } from '../../types/crypto';

interface Props {
  onSuccess: (vaultToken: string, kdfSalt: string) => void;
  isLoading?: boolean;
  error?: string | null;
  onClearError: () => void;
}

export function VaultEntry({ onSuccess, isLoading = false, error, onClearError }: Props) {
  const [words, setWords] = useState('');
  const [showWords, setShowWords] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (error || localError) {
      onClearError();
      setLocalError(null);
    }
  }, [words, error, onClearError]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateWordCount(words)) {
      setLocalError('Please enter exactly 12 words');
      return;
    }

    setIsProcessing(true);
    setLocalError(null);

    try {
      const response = await fetch('/api/auth/vault', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ words }),
        credentials: 'include'
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.detail?.message || 'Invalid passphrase');
      }

      const data = await response.json();

      // Derive vault key from 12 words
      const vaultKey: VaultKey = await deriveVaultKey(words, data.kdf_salt);

      // Store KDF salt in sessionStorage for later PIN use
      sessionStorage.setItem('vault_kdf_salt', data.kdf_salt);

      // Cache key in memory for current runtime.
      await setSessionVaultKey(vaultKey);

      // Clear sensitive words
      setWords('');

      // Return success with vault token and salt
      onSuccess(data.vault_token, data.kdf_salt);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setIsProcessing(false);
    }
  };

  const wordCount = words.trim().split(/\s+/).filter(Boolean).length;
  const isValidCount = wordCount === 12;
  const displayError = (error as string | null) || localError;
  const finalIsLoading = isLoading || isProcessing;

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="logo">
          <h1>HUSH</h1>
          <p className="tagline">Zero-Knowledge Encrypted Chat</p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="input-group">
            <label htmlFor="words">Enter your 12 words</label>
            <div className="words-input-container">
              <textarea
                ref={inputRef}
                id="words"
                value={words}
                onChange={(e) => setWords(e.target.value)}
                placeholder="word1 word2 word3 word4 word5 word6 word7 word8 word9 word10 word11 word12"
                rows={3}
                disabled={finalIsLoading}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                className={showWords ? 'visible' : 'hidden-text'}
              />
              <button
                type="button"
                className="toggle-visibility"
                onClick={() => setShowWords(!showWords)}
                tabIndex={-1}
              >
                {showWords ? 'Hide' : 'Show'}
              </button>
            </div>
            <div className="word-count">
              {wordCount}/12 words
            </div>
          </div>

          {displayError && (
            <div className="error-message">
              {displayError}
            </div>
          )}

          <button
            type="submit"
            className="primary-button"
            disabled={finalIsLoading || !isValidCount}
          >
            {isProcessing ? 'Setting up...' : finalIsLoading ? 'Verifying...' : 'Continue'}
          </button>
        </form>

        <div className="security-notice">
          <p>Your words are sent over TLS for verification only.</p>
          <p>The server stores a hash for authentication, not plaintext words.</p>
        </div>
      </div>
    </div>
  );
}
