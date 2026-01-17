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
  } catch {
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

/**
 * Decrypt to raw bytes (for binary data)
 */
export async function decryptToBytes(
  key: CryptoKey,
  encrypted: EncryptedData
): Promise<Uint8Array> {
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

    return new Uint8Array(plainBuffer);
  } catch {
    throw new Error('Decryption failed');
  }
}
