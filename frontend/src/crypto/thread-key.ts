/**
 * Thread key derivation using HKDF
 * Each thread has a unique key derived from vault key + participant UUIDs
 */

import { stringToBytes } from './encoding';
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

/**
 * Validate UUID format
 */
export function isValidUUID(uuid: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

/**
 * Generate a new random UUID
 */
export function generateUUID(): string {
  return crypto.randomUUID();
}
