/**
 * Contact state management
 * Contacts are other users identified by server-assigned user IDs
 */

import { create } from 'zustand';
import { saveContact, loadContacts, deleteContact } from '../services/storage';
import type { EncryptedData } from '../types/crypto';

export interface Contact {
  id: string;        // Server-assigned UUID
  username: string;  // Display username
  notes?: string;
  addedAt: number;
}

interface ContactState {
  contacts: Contact[];
  isLoading: boolean;

  // Actions
  loadAllContacts: (decryptFn: (encrypted: EncryptedData) => Promise<any>) => Promise<void>;
  addContact: (
    id: string,
    username: string,
    encryptFn: (data: any) => Promise<EncryptedData>
  ) => Promise<void>;
  removeContact: (id: string) => Promise<void>;
  getContact: (id: string) => Contact | undefined;
  getContactByUsername: (username: string) => Contact | undefined;
}

export const useContactStore = create<ContactState>((set, get) => ({
  contacts: [],
  isLoading: false,

  loadAllContacts: async (decryptFn) => {
    set({ isLoading: true });

    try {
      const stored = await loadContacts();
      const contacts: Contact[] = [];

      for (const { uuid: id, encrypted } of stored) {
        try {
          const data = await decryptFn(encrypted);
          contacts.push({
            id,
            username: data.username || data.displayName, // Support both old and new format
            notes: data.notes,
            addedAt: data.addedAt
          });
        } catch {
          // Skip contacts that can't be decrypted
          console.warn(`Failed to decrypt contact ${id}`);
        }
      }

      set({ contacts, isLoading: false });
    } catch (err) {
      console.error('Failed to load contacts', err);
      set({ isLoading: false });
    }
  },

  addContact: async (id, username, encryptFn) => {
    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      throw new Error('Invalid user ID format');
    }

    // Check for duplicate
    if (get().contacts.some(c => c.id === id)) {
      throw new Error('Contact already exists');
    }

    const contact: Contact = {
      id,
      username: username.trim(),
      addedAt: Date.now()
    };

    // Encrypt and save
    const encrypted = await encryptFn({
      username: contact.username,
      notes: contact.notes,
      addedAt: contact.addedAt
    });

    await saveContact(id, encrypted);

    set(state => ({
      contacts: [...state.contacts, contact]
    }));
  },

  removeContact: async (id) => {
    await deleteContact(id);
    set(state => ({
      contacts: state.contacts.filter(c => c.id !== id)
    }));
  },

  getContact: (id) => {
    return get().contacts.find(c => c.id === id);
  },

  getContactByUsername: (username) => {
    const lower = username.toLowerCase();
    return get().contacts.find(c => c.username.toLowerCase() === lower);
  }
}));
