/**
 * React context for cryptographic operations
 * Provides vault key and crypto functions to components
 */

import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { deriveVaultKey, clearKeyMaterial } from './kdf';
import { deriveThreadKey, computeThreadId } from './thread-key';
import { deriveIdentityKey, deriveContactsKey } from './identity-key';
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
  encryptForThread: <T>(threadKey: ThreadKey, data: T) => Promise<EncryptedData>;
  decryptForThread: <T>(threadKey: ThreadKey, encrypted: EncryptedData) => Promise<T>;

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

  // Thread key cache
  const [threadKeyCache] = useState(new Map<string, ThreadKey>());

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

  // Lock vault and clear keys
  const lockVault = useCallback(() => {
    if (vaultKey) {
      clearKeyMaterial(vaultKey.raw);
    }
    setVaultKey(null);
    setIdentityKey(null);
    setContactsKey(null);
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

  // Encrypt message (string)
  const encryptMessage = useCallback(async (
    threadKey: ThreadKey,
    message: string
  ): Promise<EncryptedData> => {
    return encrypt(threadKey.key, message);
  }, []);

  // Decrypt message (string)
  const decryptMessage = useCallback(async (
    threadKey: ThreadKey,
    encrypted: EncryptedData
  ): Promise<string> => {
    return decrypt(threadKey.key, encrypted);
  }, []);

  // Encrypt JSON for thread
  const encryptForThread = useCallback(async <T,>(
    threadKey: ThreadKey,
    data: T
  ): Promise<EncryptedData> => {
    return encryptJSON(threadKey.key, data);
  }, []);

  // Decrypt JSON for thread
  const decryptForThread = useCallback(async <T,>(
    threadKey: ThreadKey,
    encrypted: EncryptedData
  ): Promise<T> => {
    return decryptJSON<T>(threadKey.key, encrypted);
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

  const value: CryptoContextValue = {
    isUnlocked,
    unlockVault,
    lockVault,
    getThreadKey,
    getThreadId,
    encryptMessage,
    decryptMessage,
    encryptForThread,
    decryptForThread,
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
