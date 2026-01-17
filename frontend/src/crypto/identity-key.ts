/**
 * Identity key derivation for encrypting local identity
 * Uses vault key with different derivation path
 */

import { stringToBytes } from './encoding';
import type { VaultKey } from '../types/crypto';

const IDENTITY_INFO = 'hush-identity';
const CONTACTS_INFO = 'hush-contacts';

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

/**
 * Derive a key for encrypting local contacts list
 * Separate from identity key for additional compartmentalization
 */
export async function deriveContactsKey(vaultKey: VaultKey): Promise<CryptoKey> {
  const salt = stringToBytes('hush-local-contacts-v1');
  const saltHash = await crypto.subtle.digest('SHA-256', salt);

  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new Uint8Array(saltHash),
      info: stringToBytes(CONTACTS_INFO)
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
