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

// Conversation key (derived from vault key + participant UUIDs)
export interface ConversationKey {
  key: CryptoKey;
  conversationId: string;
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

// Conversation metadata payload (before encryption)
export interface ConversationMetadata {
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

// Contact payload (stored encrypted)
export interface ContactPayload {
  user_id: string;
  display_name: string;
  added_at: number;
}

// Local device settings (NOT synced to server, stored in IndexedDB)
export interface DeviceSettings {
  pinEnabled: boolean;  // User's PIN preference for this device
}
