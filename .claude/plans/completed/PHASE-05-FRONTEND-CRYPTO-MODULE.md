# PHASE 05: Frontend Core & Crypto Module

## Overview
This phase establishes the React/Vite frontend foundation and implements all client-side cryptography. The crypto module is the heart of the zero-knowledge architecture — all encryption/decryption happens here, never on the server.

## Objectives
1. React + Vite + TypeScript project setup
2. Argon2 WASM integration for key derivation
3. Web Crypto API utilities for AES-256-GCM
4. HKDF implementation for thread key derivation
5. Hierarchical key management
6. Secure memory handling

---

## 1. Project Setup

### Initialize Vite Project

```bash
npm create vite@latest frontend -- --template react-ts
cd frontend
npm install
```

### File: `frontend/package.json`

```json
{
  "name": "hush-frontend",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "lint": "eslint . --ext ts,tsx"
  },
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "react-router-dom": "^6.21.0",
    "argon2-browser": "^1.18.0",
    "zustand": "^4.4.7",
    "idb": "^8.0.0",
    "qrcode.react": "^3.1.0"
  },
  "devDependencies": {
    "@types/react": "^18.2.43",
    "@types/react-dom": "^18.2.17",
    "@vitejs/plugin-react": "^4.2.1",
    "typescript": "^5.2.2",
    "vite": "^5.0.8",
    "vite-plugin-pwa": "^0.17.4"
  }
}
```

### File: `frontend/vite.config.ts`

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'robots.txt'],
      manifest: {
        name: 'HUSH',
        short_name: 'HUSH',
        description: 'Zero-Knowledge Encrypted Chat',
        theme_color: '#1a1a2e',
        background_color: '#1a1a2e',
        display: 'standalone',
        icons: [
          {
            src: 'icon-192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'icon-512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      }
    })
  ],
  server: {
    proxy: {
      '/api': 'http://localhost:8000',
      '/ws': {
        target: 'ws://localhost:8000',
        ws: true
      }
    }
  },
  build: {
    target: 'esnext',
    sourcemap: false // No sourcemaps in production
  }
});
```

---

## 2. Type Definitions

### File: `frontend/src/types/crypto.ts`

```typescript
/**
 * Cryptographic type definitions
 */

// Raw key material (32 bytes for AES-256)
export type KeyMaterial = Uint8Array;

// Base64-encoded strings for transport/storage
export type Base64String = string;

// Encrypted data with IV
export interface EncryptedData {
  ciphertext: Base64String;
  iv: Base64String;
}

// Vault key (master key derived from 12 words)
export interface VaultKey {
  key: CryptoKey;
  raw: KeyMaterial; // Needed for HKDF derivation
}

// Thread key (derived from vault key + participant UUIDs)
export interface ThreadKey {
  key: CryptoKey;
  threadId: string;
}

// KDF parameters
export interface KdfParams {
  salt: Base64String;
  memory: number;      // KB
  iterations: number;
  parallelism: number;
  hashLength: number;  // bytes
}

// Message payload (before encryption)
export interface MessagePayload {
  sender_id: string;
  sender_name: string;
  content: string;
  timestamp: number;
}

// Thread metadata payload (before encryption)
export interface ThreadMetadata {
  participants: [string, string];
  created_by: {
    user_id: string;
    display_name: string;
  };
  created_at: number;
}

// Identity payload (stored encrypted in IndexedDB)
export interface IdentityPayload {
  user_id: string;
  display_name: string;
}
```

---

## 3. Encoding Utilities

### File: `frontend/src/crypto/encoding.ts`

```typescript
/**
 * Base64 and byte array encoding utilities
 * Uses URL-safe Base64 where possible
 */

/**
 * Convert Uint8Array to Base64 string
 */
export function bytesToBase64(bytes: Uint8Array): string {
  const binary = Array.from(bytes)
    .map(byte => String.fromCharCode(byte))
    .join('');
  return btoa(binary);
}

/**
 * Convert Base64 string to Uint8Array
 */
export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Convert string to UTF-8 bytes
 */
export function stringToBytes(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

/**
 * Convert UTF-8 bytes to string
 */
export function bytesToString(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

/**
 * Generate cryptographically secure random bytes
 */
export function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

/**
 * Concatenate multiple Uint8Arrays
 */
export function concatBytes(...arrays: Uint8Array[]): Uint8Array {
  const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}
```

---

## 4. Word Normalization

### File: `frontend/src/crypto/normalize.ts`

```typescript
/**
 * Normalize 12-word passphrase for consistent hashing
 * Must match server-side normalization exactly
 */

/**
 * Normalize passphrase words
 * - Convert to lowercase
 * - Trim whitespace
 * - Single space between words
 * - Remove any extra characters
 */
export function normalizeWords(words: string): string {
  return words
    .toLowerCase()
    .split(/\s+/)
    .map(word => word.trim())
    .filter(word => word.length > 0)
    .join(' ');
}

/**
 * Validate that input appears to be 12 words
 */
export function validateWordCount(words: string): boolean {
  const normalized = normalizeWords(words);
  const wordList = normalized.split(' ');
  return wordList.length === 12;
}

/**
 * Compute SHA-256 hash of normalized words
 * Used for server-side authentication
 */
export async function hashWords(normalizedWords: string): Promise<string> {
  const bytes = new TextEncoder().encode(normalizedWords);
  const hashBuffer = await crypto.subtle.digest('SHA-256', bytes);
  const hashArray = new Uint8Array(hashBuffer);

  // Convert to base64
  const binary = Array.from(hashArray)
    .map(byte => String.fromCharCode(byte))
    .join('');
  return btoa(binary);
}
```

---

## 5. Argon2 Key Derivation

### File: `frontend/src/crypto/kdf.ts`

```typescript
/**
 * Key derivation using Argon2id
 * This derives the master vault key from the 12-word passphrase
 */

import argon2 from 'argon2-browser';
import { base64ToBytes, bytesToBase64 } from './encoding';
import { normalizeWords } from './normalize';
import type { KeyMaterial, KdfParams, VaultKey } from '../types/crypto';

// Fixed KDF parameters (must match server expectations)
const DEFAULT_KDF_PARAMS: Omit<KdfParams, 'salt'> = {
  memory: 65536,      // 64 MB
  iterations: 3,
  parallelism: 2,
  hashLength: 32      // 256 bits for AES-256
};

/**
 * Derive the vault key from 12 words and salt
 *
 * @param words - The 12-word passphrase
 * @param saltBase64 - Base64-encoded salt from server
 * @returns VaultKey containing CryptoKey and raw bytes
 */
export async function deriveVaultKey(
  words: string,
  saltBase64: string
): Promise<VaultKey> {
  // Normalize the words
  const normalized = normalizeWords(words);

  // Decode salt
  const salt = base64ToBytes(saltBase64);

  // Derive key using Argon2id
  const result = await argon2.hash({
    pass: normalized,
    salt: salt,
    type: argon2.ArgonType.Argon2id,
    mem: DEFAULT_KDF_PARAMS.memory,
    time: DEFAULT_KDF_PARAMS.iterations,
    parallelism: DEFAULT_KDF_PARAMS.parallelism,
    hashLen: DEFAULT_KDF_PARAMS.hashLength
  });

  // Get raw key bytes
  const rawKey = new Uint8Array(result.hash);

  // Import as CryptoKey for HKDF operations
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    rawKey,
    { name: 'HKDF' },
    false, // not extractable
    ['deriveKey', 'deriveBits']
  );

  return {
    key: cryptoKey,
    raw: rawKey
  };
}

/**
 * Clear sensitive key material from memory
 * Note: JavaScript doesn't guarantee immediate clearing,
 * but this is better than leaving it around
 */
export function clearKeyMaterial(key: KeyMaterial): void {
  key.fill(0);
}
```

---

## 6. Thread Key Derivation (HKDF)

### File: `frontend/src/crypto/thread-key.ts`

```typescript
/**
 * Thread key derivation using HKDF
 * Each thread has a unique key derived from vault key + participant UUIDs
 */

import { stringToBytes, bytesToBase64 } from './encoding';
import type { VaultKey, ThreadKey } from '../types/crypto';

// HKDF info string (domain separation)
const HKDF_INFO = 'hush-thread';

/**
 * Sort two UUIDs alphabetically
 * Ensures same thread key regardless of who initiates
 */
function sortUUIDs(uuid1: string, uuid2: string): [string, string] {
  return uuid1 < uuid2 ? [uuid1, uuid2] : [uuid2, uuid1];
}

/**
 * Compute thread ID from two participant UUIDs
 * thread_id = SHA-256(sort(uuid_a, uuid_b))
 *
 * This is deterministic and the same for both participants
 */
export async function computeThreadId(
  uuid1: string,
  uuid2: string
): Promise<string> {
  const [sortedA, sortedB] = sortUUIDs(uuid1, uuid2);
  const combined = `${sortedA}:${sortedB}`;

  const bytes = stringToBytes(combined);
  const hashBuffer = await crypto.subtle.digest('SHA-256', bytes);
  const hashArray = new Uint8Array(hashBuffer);

  // Convert to UUID format (first 16 bytes as UUID)
  const hex = Array.from(hashArray.slice(0, 16))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

/**
 * Derive thread-specific encryption key using HKDF
 *
 * @param vaultKey - Master vault key
 * @param myUUID - Current user's UUID
 * @param otherUUID - Other participant's UUID
 * @returns ThreadKey for encrypting messages in this thread
 */
export async function deriveThreadKey(
  vaultKey: VaultKey,
  myUUID: string,
  otherUUID: string
): Promise<ThreadKey> {
  const [sortedA, sortedB] = sortUUIDs(myUUID, otherUUID);
  const combined = `${sortedA}:${sortedB}`;

  // Use combined UUIDs as HKDF salt
  const salt = stringToBytes(combined);
  const saltHash = await crypto.subtle.digest('SHA-256', salt);

  // Derive thread key using HKDF
  const threadCryptoKey = await crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new Uint8Array(saltHash),
      info: stringToBytes(HKDF_INFO)
    },
    vaultKey.key,
    {
      name: 'AES-GCM',
      length: 256
    },
    false, // not extractable
    ['encrypt', 'decrypt']
  );

  // Compute thread ID
  const threadId = await computeThreadId(myUUID, otherUUID);

  return {
    key: threadCryptoKey,
    threadId
  };
}
```

---

## 7. AES-256-GCM Encryption

### File: `frontend/src/crypto/aes.ts`

```typescript
/**
 * AES-256-GCM encryption/decryption
 * Used for all message and metadata encryption
 */

import { randomBytes, bytesToBase64, base64ToBytes, stringToBytes, bytesToString } from './encoding';
import type { EncryptedData } from '../types/crypto';

// IV size for AES-GCM (12 bytes is recommended)
const IV_LENGTH = 12;

/**
 * Encrypt data using AES-256-GCM
 *
 * @param key - CryptoKey for encryption
 * @param plaintext - Data to encrypt (string will be UTF-8 encoded)
 * @returns EncryptedData with base64-encoded ciphertext and IV
 */
export async function encrypt(
  key: CryptoKey,
  plaintext: string | Uint8Array
): Promise<EncryptedData> {
  // Convert string to bytes if needed
  const data = typeof plaintext === 'string'
    ? stringToBytes(plaintext)
    : plaintext;

  // Generate random IV
  const iv = randomBytes(IV_LENGTH);

  // Encrypt
  const cipherBuffer = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: iv
    },
    key,
    data
  );

  return {
    ciphertext: bytesToBase64(new Uint8Array(cipherBuffer)),
    iv: bytesToBase64(iv)
  };
}

/**
 * Decrypt data using AES-256-GCM
 *
 * @param key - CryptoKey for decryption
 * @param encrypted - EncryptedData with base64-encoded ciphertext and IV
 * @returns Decrypted data as string
 * @throws Error if decryption fails (wrong key, tampered data, etc.)
 */
export async function decrypt(
  key: CryptoKey,
  encrypted: EncryptedData
): Promise<string> {
  const ciphertext = base64ToBytes(encrypted.ciphertext);
  const iv = base64ToBytes(encrypted.iv);

  try {
    const plainBuffer = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: iv
      },
      key,
      ciphertext
    );

    return bytesToString(new Uint8Array(plainBuffer));
  } catch (error) {
    // Don't expose internal error details
    throw new Error('Decryption failed');
  }
}

/**
 * Encrypt JSON-serializable object
 */
export async function encryptJSON<T>(
  key: CryptoKey,
  data: T
): Promise<EncryptedData> {
  const json = JSON.stringify(data);
  return encrypt(key, json);
}

/**
 * Decrypt and parse JSON
 */
export async function decryptJSON<T>(
  key: CryptoKey,
  encrypted: EncryptedData
): Promise<T> {
  const json = await decrypt(key, encrypted);
  return JSON.parse(json) as T;
}
```

---

## 8. Identity Key (for local storage)

### File: `frontend/src/crypto/identity-key.ts`

```typescript
/**
 * Identity key derivation for encrypting local identity
 * Uses vault key with different derivation path
 */

import { stringToBytes } from './encoding';
import type { VaultKey } from '../types/crypto';

const IDENTITY_INFO = 'hush-identity';

/**
 * Derive a key specifically for encrypting local identity
 * This is separate from thread keys for compartmentalization
 */
export async function deriveIdentityKey(vaultKey: VaultKey): Promise<CryptoKey> {
  // Use static salt for identity (same across sessions)
  const salt = stringToBytes('hush-local-identity-v1');
  const saltHash = await crypto.subtle.digest('SHA-256', salt);

  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new Uint8Array(saltHash),
      info: stringToBytes(IDENTITY_INFO)
    },
    vaultKey.key,
    {
      name: 'AES-GCM',
      length: 256
    },
    false,
    ['encrypt', 'decrypt']
  );
}
```

---

## 9. Crypto Context (React)

### File: `frontend/src/crypto/CryptoContext.tsx`

```typescript
/**
 * React context for cryptographic operations
 * Provides vault key and crypto functions to components
 */

import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { deriveVaultKey, clearKeyMaterial } from './kdf';
import { deriveThreadKey, computeThreadId } from './thread-key';
import { deriveIdentityKey } from './identity-key';
import { encrypt, decrypt, encryptJSON, decryptJSON } from './aes';
import type { VaultKey, ThreadKey, EncryptedData } from '../types/crypto';

interface CryptoContextValue {
  // State
  isUnlocked: boolean;

  // Vault operations
  unlockVault: (words: string, salt: string) => Promise<void>;
  lockVault: () => void;

  // Thread key operations
  getThreadKey: (myUUID: string, otherUUID: string) => Promise<ThreadKey>;
  getThreadId: (myUUID: string, otherUUID: string) => Promise<string>;

  // Encryption operations
  encryptMessage: (threadKey: ThreadKey, message: string) => Promise<EncryptedData>;
  decryptMessage: (threadKey: ThreadKey, encrypted: EncryptedData) => Promise<string>;
  encryptIdentity: (identity: object) => Promise<EncryptedData>;
  decryptIdentity: <T>(encrypted: EncryptedData) => Promise<T>;
}

const CryptoContext = createContext<CryptoContextValue | null>(null);

export function CryptoProvider({ children }: { children: React.ReactNode }) {
  const [vaultKey, setVaultKey] = useState<VaultKey | null>(null);
  const [identityKey, setIdentityKey] = useState<CryptoKey | null>(null);

  // Thread key cache
  const [threadKeyCache] = useState(new Map<string, ThreadKey>());

  const isUnlocked = vaultKey !== null;

  // Unlock vault with 12 words
  const unlockVault = useCallback(async (words: string, salt: string) => {
    const key = await deriveVaultKey(words, salt);
    const idKey = await deriveIdentityKey(key);
    setVaultKey(key);
    setIdentityKey(idKey);
  }, []);

  // Lock vault and clear keys
  const lockVault = useCallback(() => {
    if (vaultKey) {
      clearKeyMaterial(vaultKey.raw);
    }
    setVaultKey(null);
    setIdentityKey(null);
    threadKeyCache.clear();
  }, [vaultKey, threadKeyCache]);

  // Get or derive thread key
  const getThreadKey = useCallback(async (myUUID: string, otherUUID: string): Promise<ThreadKey> => {
    if (!vaultKey) {
      throw new Error('Vault not unlocked');
    }

    const cacheKey = [myUUID, otherUUID].sort().join(':');

    if (threadKeyCache.has(cacheKey)) {
      return threadKeyCache.get(cacheKey)!;
    }

    const threadKey = await deriveThreadKey(vaultKey, myUUID, otherUUID);
    threadKeyCache.set(cacheKey, threadKey);

    return threadKey;
  }, [vaultKey, threadKeyCache]);

  // Compute thread ID
  const getThreadId = useCallback(async (myUUID: string, otherUUID: string): Promise<string> => {
    return computeThreadId(myUUID, otherUUID);
  }, []);

  // Encrypt message
  const encryptMessage = useCallback(async (
    threadKey: ThreadKey,
    message: string
  ): Promise<EncryptedData> => {
    return encrypt(threadKey.key, message);
  }, []);

  // Decrypt message
  const decryptMessage = useCallback(async (
    threadKey: ThreadKey,
    encrypted: EncryptedData
  ): Promise<string> => {
    return decrypt(threadKey.key, encrypted);
  }, []);

  // Encrypt identity
  const encryptIdentity = useCallback(async (identity: object): Promise<EncryptedData> => {
    if (!identityKey) {
      throw new Error('Vault not unlocked');
    }
    return encryptJSON(identityKey, identity);
  }, [identityKey]);

  // Decrypt identity
  const decryptIdentity = useCallback(async <T,>(encrypted: EncryptedData): Promise<T> => {
    if (!identityKey) {
      throw new Error('Vault not unlocked');
    }
    return decryptJSON<T>(identityKey, encrypted);
  }, [identityKey]);

  // Clear keys on unmount
  useEffect(() => {
    return () => {
      if (vaultKey) {
        clearKeyMaterial(vaultKey.raw);
      }
    };
  }, [vaultKey]);

  const value: CryptoContextValue = {
    isUnlocked,
    unlockVault,
    lockVault,
    getThreadKey,
    getThreadId,
    encryptMessage,
    decryptMessage,
    encryptIdentity,
    decryptIdentity
  };

  return (
    <CryptoContext.Provider value={value}>
      {children}
    </CryptoContext.Provider>
  );
}

export function useCrypto(): CryptoContextValue {
  const context = useContext(CryptoContext);
  if (!context) {
    throw new Error('useCrypto must be used within CryptoProvider');
  }
  return context;
}
```

---

## 10. Security Considerations

### Key Material Handling
- Raw key bytes cleared after use where possible
- Keys never logged or serialized
- Thread keys cached in memory only (cleared on lock)

### Cryptographic Choices
- Argon2id for password hashing (memory-hard, resistant to GPU attacks)
- HKDF-SHA256 for key derivation (standard, well-analyzed)
- AES-256-GCM for encryption (authenticated encryption)
- 12-byte random IV per encryption (never reused)

### Zero-Knowledge Architecture
- Vault key never sent to server
- Thread keys derived client-side only
- Server only sees encrypted blobs

### Browser Security
- Uses Web Crypto API (native, constant-time operations)
- Argon2 via WASM (avoids JavaScript timing attacks)
- CryptoKey objects are non-extractable where possible

---

## 11. Verification Checklist

After implementing this phase, verify:

- [ ] Argon2 WASM loads correctly
- [ ] Vault key derivation produces consistent results
- [ ] Thread key derivation is deterministic for same UUIDs
- [ ] Thread ID computation matches for both participants
- [ ] AES encryption/decryption round-trips correctly
- [ ] JSON encryption/decryption works
- [ ] Identity key derivation works
- [ ] Context provides all crypto functions
- [ ] Keys are cleared on vault lock

---

## 12. Test Code

```typescript
// Test in browser console or unit tests

import { deriveVaultKey } from './crypto/kdf';
import { deriveThreadKey, computeThreadId } from './crypto/thread-key';
import { encrypt, decrypt } from './crypto/aes';

async function testCrypto() {
  // Test vault key derivation
  const words = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
  const salt = 'dGVzdHNhbHQxMjM0NTY3OA=='; // base64 "testsalt12345678"

  const vaultKey = await deriveVaultKey(words, salt);
  console.log('Vault key derived:', vaultKey);

  // Test thread key derivation
  const uuid1 = '550e8400-e29b-41d4-a716-446655440000';
  const uuid2 = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';

  const threadKey = await deriveThreadKey(vaultKey, uuid1, uuid2);
  console.log('Thread key for', uuid1, '<->', uuid2);
  console.log('Thread ID:', threadKey.threadId);

  // Verify thread ID is same regardless of order
  const threadId1 = await computeThreadId(uuid1, uuid2);
  const threadId2 = await computeThreadId(uuid2, uuid1);
  console.assert(threadId1 === threadId2, 'Thread IDs should match');

  // Test encryption
  const plaintext = 'Hello, secure world!';
  const encrypted = await encrypt(threadKey.key, plaintext);
  console.log('Encrypted:', encrypted);

  const decrypted = await decrypt(threadKey.key, encrypted);
  console.assert(decrypted === plaintext, 'Decryption should match');
  console.log('Decrypted:', decrypted);

  console.log('All tests passed!');
}

testCrypto();
```
