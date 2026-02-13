/**
 * Crypto module exports
 */

// Encoding utilities
export {
  bytesToBase64,
  base64ToBytes,
  stringToBytes,
  bytesToString,
  randomBytes,
  concatBytes,
  bytesToHex,
  hexToBytes
} from './encoding';

// Word normalization
export {
  normalizeWords,
  validateWordCount,
  parseWords,
  hashWords
} from './normalize';

// Key derivation
export {
  deriveVaultKey,
  clearKeyMaterial,
  getKdfParams
} from './kdf';

// Conversation keys
export {
  computeConversationId,
  deriveConversationKey,
  isValidUUID,
  generateUUID
} from './conversation-key';

// AES encryption
export {
  encrypt,
  decrypt,
  encryptJSON,
  decryptJSON,
  decryptToBytes
} from './aes';

// Identity key
export {
  deriveIdentityKey,
  deriveContactsKey
} from './identity-key';

// React context
export {
  CryptoProvider,
  useCrypto
} from './CryptoContext';

// Re-export types
export type {
  KeyMaterial,
  Base64String,
  EncryptedData,
  VaultKey,
  ConversationKey,
  KdfParams,
  MessagePayload,
  ConversationMetadata,
  IdentityPayload,
  ContactPayload
} from '../types/crypto';
