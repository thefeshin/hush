/**
 * React context for cryptographic operations
 * Provides vault key and crypto functions to components
 */

import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { deriveVaultKey, clearKeyMaterial } from './kdf';
import { deriveConversationKey, computeConversationId } from './conversation-key';
import { deriveGroupKey } from './group-key';
import { deriveIdentityKey, deriveContactsKey } from './identity-key';
import { encrypt, decrypt, encryptJSON, decryptJSON } from './aes';
import { clearStoredVaultKey, clearSessionVaultKey } from '../services/vaultStorage';
import type { VaultKey, ConversationKey, EncryptedData, GroupKey } from '../types/crypto';

interface CryptoContextValue {
  // State
  isUnlocked: boolean;

  // Vault operations
  unlockVault: (words: string, salt: string) => Promise<void>;
  unlockVaultWithKey: (key: VaultKey | CryptoKey) => Promise<void>;
  lockVault: (options?: { clearStoredKey?: boolean }) => Promise<void>;

  // Conversation key operations
  getConversationKey: (myUUID: string, otherUUID: string) => Promise<ConversationKey>;
  getConversationId: (myUUID: string, otherUUID: string) => Promise<string>;
  getGroupKey: (groupId: string, epoch: number) => Promise<GroupKey>;

  // Encryption operations
  encryptMessage: (conversationKey: ConversationKey | GroupKey, message: string) => Promise<EncryptedData>;
  decryptMessage: (conversationKey: ConversationKey | GroupKey, encrypted: EncryptedData) => Promise<string>;
  encryptForConversation: <T>(conversationKey: ConversationKey | GroupKey, data: T) => Promise<EncryptedData>;
  decryptForConversation: <T>(conversationKey: ConversationKey | GroupKey, encrypted: EncryptedData) => Promise<T>;

  // Identity operations
  encryptIdentity: <T>(data: T) => Promise<EncryptedData>;
  decryptIdentity: <T>(encrypted: EncryptedData) => Promise<T>;

  // Contacts operations
  encryptContacts: <T>(data: T) => Promise<EncryptedData>;
  decryptContacts: <T>(encrypted: EncryptedData) => Promise<T>;
}

const CryptoContext = createContext<CryptoContextValue | null>(null);

export function CryptoProvider({ children }: { children: React.ReactNode }) {
  const [vaultKey, setVaultKey] = useState<VaultKey | null>(null);
  const [identityKey, setIdentityKey] = useState<CryptoKey | null>(null);
  const [contactsKey, setContactsKey] = useState<CryptoKey | null>(null);

  // Conversation key cache
  const [conversationKeyCache] = useState(new Map<string, ConversationKey>());
  const [groupKeyCache] = useState(new Map<string, GroupKey>());

  const isUnlocked = vaultKey !== null;

  // Unlock vault with 12 words
  const unlockVault = useCallback(async (words: string, salt: string) => {
    console.log('[CryptoContext] Unlocking vault...');
    const key = await deriveVaultKey(words, salt);
    console.log('[CryptoContext] Vault key derived');
    const idKey = await deriveIdentityKey(key);
    const ctKey = await deriveContactsKey(key);
    setVaultKey(key);
    setIdentityKey(idKey);
    setContactsKey(ctKey);
    console.log('[CryptoContext] Vault unlocked, isUnlocked = true');
  }, []);

  // Unlock vault with VaultKey (for PIN unlock)
  const unlockVaultWithKey = useCallback(async (vaultKeyInput: VaultKey | CryptoKey) => {
    console.log('[CryptoContext] Unlocking vault with key...');
    const vaultKey: VaultKey = 'key' in vaultKeyInput && 'raw' in vaultKeyInput
      ? vaultKeyInput
      : { key: vaultKeyInput, raw: new Uint8Array() };
    const idKey = await deriveIdentityKey(vaultKey);
    const ctKey = await deriveContactsKey(vaultKey);
    setVaultKey(vaultKey);
    setIdentityKey(idKey);
    setContactsKey(ctKey);
    console.log('[CryptoContext] Vault unlocked with key, isUnlocked = true');
  }, []);

  // Lock vault and clear keys
  const lockVault = useCallback(async (options?: { clearStoredKey?: boolean }) => {
    // Keep PIN-protected stored key by default on lock.
    if (options?.clearStoredKey) {
      await clearStoredVaultKey();
    }
    // Clear session cache
    clearSessionVaultKey();
    // Clear keys from memory
    if (vaultKey) {
      clearKeyMaterial(vaultKey.raw);
    }
    setVaultKey(null);
    setIdentityKey(null);
    setContactsKey(null);
    conversationKeyCache.clear();
    groupKeyCache.clear();
  }, [vaultKey, conversationKeyCache, groupKeyCache]);

  // Get or derive conversation key
  const getConversationKey = useCallback(async (myUUID: string, otherUUID: string): Promise<ConversationKey> => {
    if (!vaultKey) {
      throw new Error('Vault not unlocked');
    }

    const cacheKey = [myUUID, otherUUID].sort().join(':');

    if (conversationKeyCache.has(cacheKey)) {
      return conversationKeyCache.get(cacheKey)!;
    }

    const conversationKey = await deriveConversationKey(vaultKey, myUUID, otherUUID);
    conversationKeyCache.set(cacheKey, conversationKey);

    return conversationKey;
  }, [vaultKey, conversationKeyCache]);

  // Compute conversation ID
  const getConversationId = useCallback(async (myUUID: string, otherUUID: string): Promise<string> => {
    return computeConversationId(myUUID, otherUUID);
  }, []);

  const getGroupKey = useCallback(async (groupId: string, epoch: number): Promise<GroupKey> => {
    if (!vaultKey) {
      throw new Error('Vault not unlocked');
    }

    const cacheKey = `${groupId}:${epoch}`;
    if (groupKeyCache.has(cacheKey)) {
      return groupKeyCache.get(cacheKey)!;
    }

    const groupKey = await deriveGroupKey(vaultKey, groupId, epoch);
    groupKeyCache.set(cacheKey, groupKey);
    return groupKey;
  }, [vaultKey, groupKeyCache]);

  // Encrypt message (string)
  const encryptMessage = useCallback(async (
    conversationKey: ConversationKey | GroupKey,
    message: string
  ): Promise<EncryptedData> => {
    return encrypt(conversationKey.key, message);
  }, []);

  // Decrypt message (string)
  const decryptMessage = useCallback(async (
    conversationKey: ConversationKey | GroupKey,
    encrypted: EncryptedData
  ): Promise<string> => {
    return decrypt(conversationKey.key, encrypted);
  }, []);

  // Encrypt JSON for conversation
  const encryptForConversation = useCallback(async <T,>(
    conversationKey: ConversationKey | GroupKey,
    data: T
  ): Promise<EncryptedData> => {
    return encryptJSON(conversationKey.key, data);
  }, []);

  // Decrypt JSON for conversation
  const decryptForConversation = useCallback(async <T,>(
    conversationKey: ConversationKey | GroupKey,
    encrypted: EncryptedData
  ): Promise<T> => {
    return decryptJSON<T>(conversationKey.key, encrypted);
  }, []);

  // Encrypt identity
  const encryptIdentityFn = useCallback(async <T,>(data: T): Promise<EncryptedData> => {
    if (!identityKey) {
      throw new Error('Vault not unlocked');
    }
    return encryptJSON(identityKey, data);
  }, [identityKey]);

  // Decrypt identity
  const decryptIdentityFn = useCallback(async <T,>(encrypted: EncryptedData): Promise<T> => {
    if (!identityKey) {
      throw new Error('Vault not unlocked');
    }
    return decryptJSON<T>(identityKey, encrypted);
  }, [identityKey]);

  // Encrypt contacts
  const encryptContacts = useCallback(async <T,>(data: T): Promise<EncryptedData> => {
    if (!contactsKey) {
      throw new Error('Vault not unlocked');
    }
    return encryptJSON(contactsKey, data);
  }, [contactsKey]);

  // Decrypt contacts
  const decryptContacts = useCallback(async <T,>(encrypted: EncryptedData): Promise<T> => {
    if (!contactsKey) {
      throw new Error('Vault not unlocked');
    }
    return decryptJSON<T>(contactsKey, encrypted);
  }, [contactsKey]);

  // Clear keys on unmount
  useEffect(() => {
    return () => {
      if (vaultKey) {
        clearKeyMaterial(vaultKey.raw);
      }
    };
  }, [vaultKey]);

  // Listen for unlock-vault custom event (from App.tsx)
  useEffect(() => {
    const handleUnlockVault = (event: CustomEvent<VaultKey | CryptoKey>) => {
      unlockVaultWithKey(event.detail);
    };

    window.addEventListener('unlock-vault', handleUnlockVault as EventListener);

    return () => {
      window.removeEventListener('unlock-vault', handleUnlockVault as EventListener);
    };
  }, [unlockVaultWithKey]);

  const value: CryptoContextValue = {
    isUnlocked,
    unlockVault,
    unlockVaultWithKey,
    lockVault,
    getConversationKey,
    getConversationId,
    getGroupKey,
    encryptMessage,
    decryptMessage,
    encryptForConversation,
    decryptForConversation,
    encryptIdentity: encryptIdentityFn,
    decryptIdentity: decryptIdentityFn,
    encryptContacts,
    decryptContacts
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
