/**
 * Key derivation using Argon2id
 * This derives the master vault key from the 12-word passphrase
 */

import argon2 from 'argon2-browser';
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

/**
 * Get KDF parameters (for display/debugging)
 */
export function getKdfParams(): Omit<KdfParams, 'salt'> {
  return { ...DEFAULT_KDF_PARAMS };
}
