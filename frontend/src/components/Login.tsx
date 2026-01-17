/**
 * 12-word passphrase login screen
 */

import React, { useState, useRef, useEffect } from 'react';
import { useAuthStore } from '../stores/authStore';
import { useCrypto } from '../crypto/CryptoContext';
import { validateWordCount } from '../crypto/normalize';

interface Props {
  onSuccess: () => void;
}

export function Login({ onSuccess }: Props) {
  const [words, setWords] = useState('');
  const [showWords, setShowWords] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const { login, isLoading, error, clearError } = useAuthStore();
  const { unlockVault } = useCrypto();

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Clear error when words change
  useEffect(() => {
    if (error) {
      clearError();
    }
  }, [words]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate word count
    if (!validateWordCount(words)) {
      return;
    }

    try {
      // Authenticate with server
      const { kdfSalt } = await login(words);

      // Derive vault key locally
      await unlockVault(words, kdfSalt);

      // Clear sensitive input
      setWords('');

      onSuccess();
    } catch (err) {
      // Error is already set in store
    }
  };

  const wordCount = words.trim().split(/\s+/).filter(Boolean).length;
  const isValidCount = wordCount === 12;

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
                disabled={isLoading}
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

          {error && (
            <div className="error-message">
              {error}
            </div>
          )}

          <button
            type="submit"
            className="primary-button"
            disabled={isLoading || !isValidCount}
          >
            {isLoading ? 'Unlocking...' : 'Unlock Vault'}
          </button>
        </form>

        <div className="security-notice">
          <p>Your words are never sent to the server.</p>
          <p>Only a hash is used for authentication.</p>
        </div>
      </div>
    </div>
  );
}
