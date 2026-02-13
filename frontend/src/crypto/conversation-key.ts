/**
 * Conversation key derivation using HKDF
 * Each conversation has a unique key derived from vault key + participant UUIDs
 */

import { stringToBytes } from './encoding';
import type { ConversationKey, VaultKey } from '../types/crypto';

// HKDF info string (domain separation)
const HKDF_INFO = 'hush-conversation';

/**
 * Sort two UUIDs alphabetically
 * Ensures same conversation key regardless of who initiates
 */
function sortUUIDs(uuid1: string, uuid2: string): [string, string] {
  return uuid1 < uuid2 ? [uuid1, uuid2] : [uuid2, uuid1];
}

/**
 * Compute conversation ID from two participant UUIDs
 * conversation_id = SHA-256(sort(uuid_a, uuid_b))
 *
 * This is deterministic and the same for both participants
 */
export async function computeConversationId(
  uuid1: string,
  uuid2: string
): Promise<string> {
  const [sortedA, sortedB] = sortUUIDs(uuid1, uuid2);
  const combined = `${sortedA}:${sortedB}`;

  const bytes = stringToBytes(combined);
  const hashBuffer = await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>);
  const hashArray = new Uint8Array(hashBuffer);

  // Convert to UUID format (first 16 bytes as UUID)
  const hex = Array.from(hashArray.slice(0, 16))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

/**
 * Derive conversation-specific encryption key using HKDF
 *
 * @param vaultKey - Master vault key
 * @param myUUID - Current user's UUID
 * @param otherUUID - Other participant's UUID
 * @returns ConversationKey for encrypting messages in this conversation
 */
export async function deriveConversationKey(
  vaultKey: VaultKey,
  myUUID: string,
  otherUUID: string
): Promise<ConversationKey> {
  const [sortedA, sortedB] = sortUUIDs(myUUID, otherUUID);
  const combined = `${sortedA}:${sortedB}`;

  // Use combined UUIDs as HKDF salt
  const salt = stringToBytes(combined);
  const saltHash = await crypto.subtle.digest('SHA-256', salt as Uint8Array<ArrayBuffer>);

  // Derive conversation key using HKDF
  const conversationCryptoKey = await crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new Uint8Array(saltHash) as Uint8Array<ArrayBuffer>,
      info: stringToBytes(HKDF_INFO) as Uint8Array<ArrayBuffer>
    },
    vaultKey.key,
    {
      name: 'AES-GCM',
      length: 256
    },
    false, // not extractable
    ['encrypt', 'decrypt']
  );

  // Compute conversation ID
  const conversationId = await computeConversationId(myUUID, otherUUID);

  return {
    key: conversationCryptoKey,
    conversationId
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
