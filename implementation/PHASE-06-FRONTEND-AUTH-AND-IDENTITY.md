# PHASE 06: Frontend Authentication & Identity

## Overview
This phase implements the frontend authentication flow, identity management, and secure local storage. Users authenticate with their 12-word passphrase, create a local identity (UUID + display name), and can export their UUID for sharing with contacts.

## Objectives
1. 12-word passphrase input UI
2. Authentication API integration
3. Local identity creation and persistence
4. IndexedDB encrypted storage
5. UUID export/share functionality
6. Session management

---

## 1. IndexedDB Storage Service

### File: `frontend/src/services/storage.ts`

```typescript
/**
 * Encrypted IndexedDB storage service
 * All stored data is encrypted with the vault key
 */

import { openDB, DBSchema, IDBPDatabase } from 'idb';
import type { EncryptedData } from '../types/crypto';

interface HushDBSchema extends DBSchema {
  identity: {
    key: 'current';
    value: {
      id: 'current';
      ciphertext: string;
      iv: string;
      updatedAt: number;
    };
  };
  contacts: {
    key: string; // UUID
    value: {
      uuid: string;
      ciphertext: string; // encrypted display name + notes
      iv: string;
      addedAt: number;
    };
    indexes: { 'by-added': number };
  };
  threads: {
    key: string; // thread_id
    value: {
      threadId: string;
      ciphertext: string; // encrypted thread metadata
      iv: string;
      lastMessageAt: number;
    };
    indexes: { 'by-last-message': number };
  };
  messages: {
    key: string; // message_id
    value: {
      id: string;
      threadId: string;
      ciphertext: string;
      iv: string;
      createdAt: number;
    };
    indexes: { 'by-thread': string; 'by-created': number };
  };
}

const DB_NAME = 'hush-vault';
const DB_VERSION = 1;

let db: IDBPDatabase<HushDBSchema> | null = null;

/**
 * Initialize the database
 */
export async function initDatabase(): Promise<void> {
  db = await openDB<HushDBSchema>(DB_NAME, DB_VERSION, {
    upgrade(database, oldVersion, newVersion, transaction) {
      // Identity store (single record)
      if (!database.objectStoreNames.contains('identity')) {
        database.createObjectStore('identity', { keyPath: 'id' });
      }

      // Contacts store
      if (!database.objectStoreNames.contains('contacts')) {
        const contactStore = database.createObjectStore('contacts', { keyPath: 'uuid' });
        contactStore.createIndex('by-added', 'addedAt');
      }

      // Threads store
      if (!database.objectStoreNames.contains('threads')) {
        const threadStore = database.createObjectStore('threads', { keyPath: 'threadId' });
        threadStore.createIndex('by-last-message', 'lastMessageAt');
      }

      // Messages store
      if (!database.objectStoreNames.contains('messages')) {
        const msgStore = database.createObjectStore('messages', { keyPath: 'id' });
        msgStore.createIndex('by-thread', 'threadId');
        msgStore.createIndex('by-created', 'createdAt');
      }
    }
  });
}

/**
 * Get database instance
 */
function getDB(): IDBPDatabase<HushDBSchema> {
  if (!db) {
    throw new Error('Database not initialized');
  }
  return db;
}

// ==================== Identity Operations ====================

/**
 * Save encrypted identity
 */
export async function saveIdentity(encrypted: EncryptedData): Promise<void> {
  await getDB().put('identity', {
    id: 'current',
    ciphertext: encrypted.ciphertext,
    iv: encrypted.iv,
    updatedAt: Date.now()
  });
}

/**
 * Load encrypted identity
 */
export async function loadIdentity(): Promise<EncryptedData | null> {
  const record = await getDB().get('identity', 'current');
  if (!record) return null;

  return {
    ciphertext: record.ciphertext,
    iv: record.iv
  };
}

/**
 * Delete identity (on logout/clear)
 */
export async function deleteIdentity(): Promise<void> {
  await getDB().delete('identity', 'current');
}

// ==================== Contact Operations ====================

/**
 * Save a contact (encrypted)
 */
export async function saveContact(uuid: string, encrypted: EncryptedData): Promise<void> {
  await getDB().put('contacts', {
    uuid,
    ciphertext: encrypted.ciphertext,
    iv: encrypted.iv,
    addedAt: Date.now()
  });
}

/**
 * Load all contacts
 */
export async function loadContacts(): Promise<Array<{ uuid: string; encrypted: EncryptedData }>> {
  const records = await getDB().getAllFromIndex('contacts', 'by-added');
  return records.map(r => ({
    uuid: r.uuid,
    encrypted: { ciphertext: r.ciphertext, iv: r.iv }
  }));
}

/**
 * Delete a contact
 */
export async function deleteContact(uuid: string): Promise<void> {
  await getDB().delete('contacts', uuid);
}

// ==================== Thread Operations ====================

/**
 * Save thread metadata (encrypted)
 */
export async function saveThread(
  threadId: string,
  encrypted: EncryptedData,
  lastMessageAt: number = Date.now()
): Promise<void> {
  await getDB().put('threads', {
    threadId,
    ciphertext: encrypted.ciphertext,
    iv: encrypted.iv,
    lastMessageAt
  });
}

/**
 * Load all threads
 */
export async function loadThreads(): Promise<Array<{ threadId: string; encrypted: EncryptedData; lastMessageAt: number }>> {
  const records = await getDB().getAllFromIndex('threads', 'by-last-message');
  return records.reverse().map(r => ({
    threadId: r.threadId,
    encrypted: { ciphertext: r.ciphertext, iv: r.iv },
    lastMessageAt: r.lastMessageAt
  }));
}

// ==================== Message Operations ====================

/**
 * Save a message (encrypted)
 */
export async function saveMessage(
  id: string,
  threadId: string,
  encrypted: EncryptedData,
  createdAt: number = Date.now()
): Promise<void> {
  await getDB().put('messages', {
    id,
    threadId,
    ciphertext: encrypted.ciphertext,
    iv: encrypted.iv,
    createdAt
  });
}

/**
 * Load messages for a thread
 */
export async function loadMessages(
  threadId: string,
  limit: number = 50
): Promise<Array<{ id: string; encrypted: EncryptedData; createdAt: number }>> {
  const records = await getDB().getAllFromIndex('messages', 'by-thread', threadId);

  // Sort by created time and limit
  return records
    .sort((a, b) => a.createdAt - b.createdAt)
    .slice(-limit)
    .map(r => ({
      id: r.id,
      encrypted: { ciphertext: r.ciphertext, iv: r.iv },
      createdAt: r.createdAt
    }));
}

// ==================== Clear All Data ====================

/**
 * Clear all stored data (for logout)
 */
export async function clearAllData(): Promise<void> {
  const database = getDB();
  await database.clear('identity');
  await database.clear('contacts');
  await database.clear('threads');
  await database.clear('messages');
}

/**
 * Delete entire database
 */
export async function deleteDatabase(): Promise<void> {
  if (db) {
    db.close();
    db = null;
  }
  await indexedDB.deleteDatabase(DB_NAME);
}
```

---

## 2. Auth API Service

### File: `frontend/src/services/api.ts`

```typescript
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
  const data = await response.json();
  return data.kdf_salt;
}

/**
 * Custom error for authentication failures
 */
export class AuthenticationError extends Error {
  constructor(
    public code: string,
    public remainingAttempts?: number
  ) {
    super(code === 'invalid_credentials'
      ? `Invalid passphrase. ${remainingAttempts ?? 0} attempts remaining.`
      : code === 'ip_blocked'
        ? 'Access blocked. Too many failed attempts.'
        : 'Authentication failed.'
    );
  }
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
```

---

## 3. Auth Store (Zustand)

### File: `frontend/src/stores/authStore.ts`

```typescript
/**
 * Authentication state management
 */

import { create } from 'zustand';
import { authenticate, getSalt, AuthenticationError } from '../services/api';

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
    set({ isLoading: true, error: null });

    try {
      const response = await authenticate(words);

      set({
        isAuthenticated: true,
        isLoading: false,
        token: response.token,
        kdfSalt: response.kdf_salt
      });

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
```

---

## 4. Identity Creation Component

### File: `frontend/src/components/IdentitySetup.tsx`

```typescript
/**
 * Identity creation screen
 * Shown after successful authentication if no identity exists
 */

import React, { useState } from 'react';
import { useAuthStore } from '../stores/authStore';
import { useCrypto } from '../crypto/CryptoContext';
import { saveIdentity } from '../services/storage';
import type { IdentityPayload } from '../types/crypto';

// Generate UUID v4
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (crypto.getRandomValues(new Uint8Array(1))[0] & 0x0f) >> (c === 'x' ? 0 : 1);
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

interface Props {
  onComplete: () => void;
}

export function IdentitySetup({ onComplete }: Props) {
  const [displayName, setDisplayName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setIdentity = useAuthStore(state => state.setIdentity);
  const { encryptIdentity } = useCrypto();

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();

    const trimmedName = displayName.trim();
    if (!trimmedName) {
      setError('Please enter a display name');
      return;
    }

    if (trimmedName.length > 50) {
      setError('Display name must be 50 characters or less');
      return;
    }

    setIsCreating(true);
    setError(null);

    try {
      // Generate UUID
      const userId = generateUUID();

      // Create identity payload
      const identity: IdentityPayload = {
        user_id: userId,
        display_name: trimmedName
      };

      // Encrypt and save to IndexedDB
      const encrypted = await encryptIdentity(identity);
      await saveIdentity(encrypted);

      // Update auth store
      setIdentity({
        userId,
        displayName: trimmedName
      });

      onComplete();
    } catch (err) {
      setError('Failed to create identity. Please try again.');
      setIsCreating(false);
    }
  };

  return (
    <div className="identity-setup">
      <div className="identity-setup-card">
        <h2>Create Your Identity</h2>
        <p className="subtitle">
          Choose a display name. This is how you'll appear to others.
        </p>

        <form onSubmit={handleCreate}>
          <div className="input-group">
            <label htmlFor="displayName">Display Name</label>
            <input
              id="displayName"
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Enter your name..."
              maxLength={50}
              autoFocus
              disabled={isCreating}
            />
          </div>

          {error && (
            <div className="error-message">{error}</div>
          )}

          <button
            type="submit"
            className="primary-button"
            disabled={isCreating || !displayName.trim()}
          >
            {isCreating ? 'Creating...' : 'Create Identity'}
          </button>
        </form>

        <p className="note">
          Your identity is stored locally and encrypted with your vault key.
          The server never sees your name or UUID.
        </p>
      </div>
    </div>
  );
}
```

---

## 5. Login Screen Component

### File: `frontend/src/components/Login.tsx`

```typescript
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
                style={{
                  WebkitTextSecurity: showWords ? 'none' : 'disc'
                } as React.CSSProperties}
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
```

---

## 6. UUID Share Component

### File: `frontend/src/components/UUIDShare.tsx`

```typescript
/**
 * UUID sharing component
 * Allows users to copy or display QR code of their UUID
 */

import React, { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { useAuthStore } from '../stores/authStore';

export function UUIDShare() {
  const [showQR, setShowQR] = useState(false);
  const [copied, setCopied] = useState(false);

  const identity = useAuthStore(state => state.identity);

  if (!identity) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(identity.userId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      // Fallback for older browsers
      const textarea = document.createElement('textarea');
      textarea.value = identity.userId;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="uuid-share">
      <h3>Your Chat Address</h3>
      <p className="subtitle">
        Share this with people you want to chat with.
        They'll need it to start a conversation with you.
      </p>

      <div className="uuid-display">
        <code>{identity.userId}</code>
        <button
          onClick={handleCopy}
          className="copy-button"
        >
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>

      <button
        onClick={() => setShowQR(!showQR)}
        className="toggle-qr-button"
      >
        {showQR ? 'Hide QR Code' : 'Show QR Code'}
      </button>

      {showQR && (
        <div className="qr-container">
          <QRCodeSVG
            value={identity.userId}
            size={200}
            level="M"
            includeMargin={true}
            bgColor="#ffffff"
            fgColor="#000000"
          />
          <p className="qr-hint">Scan to get UUID</p>
        </div>
      )}

      <div className="warning">
        <strong>Important:</strong> Only share your UUID with people you trust.
        Anyone with your UUID can send you messages.
      </div>
    </div>
  );
}
```

---

## 7. App Entry Point with Auth Flow

### File: `frontend/src/App.tsx`

```typescript
/**
 * Main application component
 * Handles authentication flow and routing
 */

import React, { useEffect, useState } from 'react';
import { CryptoProvider, useCrypto } from './crypto/CryptoContext';
import { useAuthStore } from './stores/authStore';
import { initDatabase, loadIdentity } from './services/storage';
import { Login } from './components/Login';
import { IdentitySetup } from './components/IdentitySetup';
import { Chat } from './components/Chat';
import type { IdentityPayload } from './types/crypto';

import './styles/main.css';

function AppContent() {
  const [appState, setAppState] = useState<'loading' | 'login' | 'setup' | 'chat'>('loading');

  const { isAuthenticated } = useAuthStore();
  const { isUnlocked, decryptIdentity } = useCrypto();
  const setIdentity = useAuthStore(state => state.setIdentity);

  // Initialize database on mount
  useEffect(() => {
    initDatabase().catch(console.error);
  }, []);

  // Handle auth state changes
  useEffect(() => {
    if (!isAuthenticated || !isUnlocked) {
      setAppState('login');
      return;
    }

    // Try to load existing identity
    loadExistingIdentity();
  }, [isAuthenticated, isUnlocked]);

  const loadExistingIdentity = async () => {
    try {
      const encrypted = await loadIdentity();

      if (encrypted) {
        // Decrypt and restore identity
        const identity = await decryptIdentity<IdentityPayload>(encrypted);
        setIdentity({
          userId: identity.user_id,
          displayName: identity.display_name
        });
        setAppState('chat');
      } else {
        // No existing identity - show setup
        setAppState('setup');
      }
    } catch (err) {
      // Decryption failed - identity from different vault
      console.error('Failed to decrypt identity');
      setAppState('setup');
    }
  };

  const handleLoginSuccess = () => {
    // Will trigger useEffect to check for identity
  };

  const handleIdentityCreated = () => {
    setAppState('chat');
  };

  switch (appState) {
    case 'loading':
      return (
        <div className="loading-screen">
          <div className="spinner" />
        </div>
      );

    case 'login':
      return <Login onSuccess={handleLoginSuccess} />;

    case 'setup':
      return <IdentitySetup onComplete={handleIdentityCreated} />;

    case 'chat':
      return <Chat />;
  }
}

export function App() {
  return (
    <CryptoProvider>
      <AppContent />
    </CryptoProvider>
  );
}
```

---

## 8. Basic Styles

### File: `frontend/src/styles/main.css`

```css
/* Base styles */
:root {
  --bg-primary: #1a1a2e;
  --bg-secondary: #16213e;
  --bg-tertiary: #0f3460;
  --text-primary: #eaeaea;
  --text-secondary: #a0a0a0;
  --accent: #e94560;
  --accent-hover: #ff6b6b;
  --success: #4ade80;
  --error: #ef4444;
  --border: #2a2a4a;
}

* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background-color: var(--bg-primary);
  color: var(--text-primary);
  line-height: 1.6;
}

/* Login Screen */
.login-screen {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
}

.login-card {
  background: var(--bg-secondary);
  border-radius: 1rem;
  padding: 2rem;
  max-width: 400px;
  width: 100%;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
}

.logo h1 {
  font-size: 2.5rem;
  text-align: center;
  letter-spacing: 0.5rem;
  color: var(--accent);
}

.tagline {
  text-align: center;
  color: var(--text-secondary);
  margin-bottom: 2rem;
}

.input-group {
  margin-bottom: 1rem;
}

.input-group label {
  display: block;
  margin-bottom: 0.5rem;
  font-weight: 500;
}

.words-input-container {
  position: relative;
}

.words-input-container textarea {
  width: 100%;
  padding: 1rem;
  padding-right: 4rem;
  background: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: 0.5rem;
  color: var(--text-primary);
  font-family: monospace;
  font-size: 1rem;
  resize: none;
}

.toggle-visibility {
  position: absolute;
  right: 0.5rem;
  top: 50%;
  transform: translateY(-50%);
  background: transparent;
  border: none;
  color: var(--accent);
  cursor: pointer;
  padding: 0.5rem;
}

.word-count {
  text-align: right;
  font-size: 0.875rem;
  color: var(--text-secondary);
  margin-top: 0.25rem;
}

.primary-button {
  width: 100%;
  padding: 1rem;
  background: var(--accent);
  border: none;
  border-radius: 0.5rem;
  color: white;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s;
}

.primary-button:hover:not(:disabled) {
  background: var(--accent-hover);
}

.primary-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.error-message {
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid var(--error);
  border-radius: 0.5rem;
  padding: 0.75rem;
  margin-bottom: 1rem;
  color: var(--error);
  font-size: 0.875rem;
}

.security-notice {
  margin-top: 1.5rem;
  padding-top: 1.5rem;
  border-top: 1px solid var(--border);
  text-align: center;
  font-size: 0.75rem;
  color: var(--text-secondary);
}

/* UUID Share */
.uuid-share {
  padding: 1.5rem;
  background: var(--bg-secondary);
  border-radius: 0.5rem;
}

.uuid-display {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin: 1rem 0;
}

.uuid-display code {
  flex: 1;
  padding: 0.75rem;
  background: var(--bg-primary);
  border-radius: 0.25rem;
  font-size: 0.875rem;
  word-break: break-all;
}

.copy-button {
  padding: 0.75rem 1rem;
  background: var(--accent);
  border: none;
  border-radius: 0.25rem;
  color: white;
  cursor: pointer;
}

.qr-container {
  text-align: center;
  margin: 1rem 0;
  padding: 1rem;
  background: white;
  border-radius: 0.5rem;
}

.warning {
  margin-top: 1rem;
  padding: 0.75rem;
  background: rgba(233, 69, 96, 0.1);
  border-radius: 0.25rem;
  font-size: 0.875rem;
}

/* Loading */
.loading-screen {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
}

.spinner {
  width: 40px;
  height: 40px;
  border: 3px solid var(--border);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
```

---

## 9. Security Considerations

### Input Handling
- Words input uses `-webkit-text-security: disc` to hide by default
- Input cleared immediately after vault unlock
- No autocomplete/spellcheck on sensitive fields

### Identity Storage
- Identity encrypted before storing in IndexedDB
- Encryption key derived from vault key (never stored)
- Decryption attempted on each unlock to verify vault match

### UUID Generation
- Uses `crypto.getRandomValues()` for secure randomness
- Standard UUID v4 format

---

## 10. Verification Checklist

After implementing this phase, verify:

- [ ] Login screen accepts 12 words
- [ ] Words are hidden by default
- [ ] Word count is displayed
- [ ] Invalid words show error with remaining attempts
- [ ] Successful login derives vault key
- [ ] Identity setup creates UUID
- [ ] Identity is encrypted and saved
- [ ] Identity loads on subsequent logins
- [ ] UUID can be copied
- [ ] QR code displays correctly
- [ ] Logout clears all state

---

## 11. Test Flow

1. Deploy and get 12 words from deployment output
2. Navigate to frontend URL
3. Enter 12 words
4. Should proceed to identity setup
5. Enter display name
6. Should see main chat interface
7. Refresh page - should auto-restore identity
8. Use wrong words - should fail with attempt count
