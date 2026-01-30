/**
 * Key derivation using Argon2id
 * This derives the master vault key from the 12-word passphrase
 */

import { base64ToBytes } from './encoding';
import { normalizeWords } from './normalize';
import type { KeyMaterial, KdfParams, VaultKey } from '../types/crypto';

// Fixed KDF parameters (must match server expectations)
const DEFAULT_KDF_PARAMS: Omit<KdfParams, 'salt'> = {
  memory: 65536,      // 64 MB
  iterations: 3,
  parallelism: 2,
  hashLength: 32      // 256 bits for AES-256
};

// Argon2id type value (2)
const ARGON2ID_TYPE = 2;

// Load argon2-bundled.min.js which creates window.argon2
let argon2LoadPromise: Promise<any> | null = null;

async function loadArgon2(): Promise<any> {
  // Return cached promise if already loading/loaded
  if (argon2LoadPromise) {
    return argon2LoadPromise;
  }

  // Check if already loaded (e.g., via script tag in HTML)
  if ((window as any).argon2) {
    return (window as any).argon2;
  }

  // Load the bundled script
  argon2LoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = '/argon2-bundled.min.js';
    script.onload = () => {
      if ((window as any).argon2) {
        resolve((window as any).argon2);
      } else {
        reject(new Error('argon2 not found after script load'));
      }
    };
    script.onerror = () => reject(new Error('Failed to load argon2 script'));
    document.head.appendChild(script);
  });

  return argon2LoadPromise;
}

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
  // Load argon2 library
  const argon2 = await loadArgon2();

  // Normalize the words
  const normalized = normalizeWords(words);

  // Decode salt
  const salt = base64ToBytes(saltBase64);

  console.log('[KDF] About to hash with argon2');

  // Derive key using Argon2id
  const result = await argon2.hash({
    pass: normalized,
    salt: salt,
    type: ARGON2ID_TYPE,
    mem: DEFAULT_KDF_PARAMS.memory,
    time: DEFAULT_KDF_PARAMS.iterations,
    parallelism: DEFAULT_KDF_PARAMS.parallelism,
    hashLen: DEFAULT_KDF_PARAMS.hashLength
  });

  console.log('[KDF] Argon2 hash complete');

  // Get raw key bytes
  const rawKey = new Uint8Array(result.hash);

  // Import as CryptoKey for HKDF operations
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    rawKey,
    { name: 'HKDF' },
    false, // KDF keys must be non-extractable
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

/**
 * Get KDF parameters (for display/debugging)
 */
export function getKdfParams(): Omit<KdfParams, 'salt'> {
  return { ...DEFAULT_KDF_PARAMS };
}
