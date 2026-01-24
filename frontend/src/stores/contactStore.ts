/**
 * Contact state management
 * Contacts are other users' UUIDs with optional metadata
 */

import { create } from 'zustand';
import { saveContact, loadContacts, deleteContact } from '../services/storage';
import type { EncryptedData } from '../types/crypto';

interface Contact {
  uuid: string;
  displayName: string;
  notes?: string;
  addedAt: number;
}

interface ContactData {
  displayName: string;
  notes?: string;
  addedAt: number;
}

interface ContactState {
  contacts: Contact[];
  isLoading: boolean;

  // Actions
  loadAllContacts: (decryptFn: (encrypted: EncryptedData) => Promise<ContactData>) => Promise<void>;
  addContact: (
    uuid: string,
    displayName: string,
    encryptFn: (data: ContactData) => Promise<EncryptedData>
  ) => Promise<void>;
  removeContact: (uuid: string) => Promise<void>;
  getContact: (uuid: string) => Contact | undefined;
}

export const useContactStore = create<ContactState>((set, get) => ({
  contacts: [],
  isLoading: false,

  loadAllContacts: async (decryptFn) => {
    set({ isLoading: true });

    try {
      const stored = await loadContacts();
      const contacts: Contact[] = [];

      for (const { uuid, encrypted } of stored) {
        try {
          const data = await decryptFn(encrypted);
          contacts.push({
            uuid,
            displayName: data.displayName,
            notes: data.notes,
            addedAt: data.addedAt
          });
        } catch {
          // Skip contacts that can't be decrypted
          console.warn(`Failed to decrypt contact ${uuid}`);
        }
      }

      set({ contacts, isLoading: false });
    } catch (err) {
      console.error('Failed to load contacts', err);
      set({ isLoading: false });
    }
  },

  addContact: async (uuid, displayName, encryptFn) => {
    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(uuid)) {
      throw new Error('Invalid UUID format');
    }

    // Check for duplicate
    if (get().contacts.some(c => c.uuid === uuid)) {
      throw new Error('Contact already exists');
    }

    const contact: Contact = {
      uuid,
      displayName: displayName.trim(),
      addedAt: Date.now()
    };

    // Encrypt and save
    const encrypted = await encryptFn({
      displayName: contact.displayName,
      notes: contact.notes,
      addedAt: contact.addedAt
    });

    await saveContact(uuid, encrypted);

    set(state => ({
      contacts: [...state.contacts, contact]
    }));
  },

  removeContact: async (uuid) => {
    await deleteContact(uuid);
    set(state => ({
      contacts: state.contacts.filter(c => c.uuid !== uuid)
    }));
  },

  getContact: (uuid) => {
    return get().contacts.find(c => c.uuid === uuid);
  }
}));
