/**
 * PIN Management Service
 * Handles PIN enable/disable/change operations
 */

import { storeVaultKey, retrieveVaultKey, clearStoredVaultKey } from './vaultStorage';
import { setPINEnabled } from './deviceSettings';
import type { VaultKey } from '../types/crypto';

/**
 * Enable PIN: encrypt vault key with PIN and store it
 */
export async function enablePIN(vaultKey: VaultKey, pin: string): Promise<void> {
  // Store encrypted vault key with PIN
  await storeVaultKey(vaultKey, pin);

  // Update device settings
  await setPINEnabled(true);
}

/**
 * Disable PIN: verify current PIN, delete stored vault key, update device settings
 */
export async function disablePIN(currentPin: string): Promise<void> {
  // First verify the PIN by trying to retrieve the vault key
  const vaultKey = await retrieveVaultKey(currentPin);
  if (!vaultKey) {
    throw new Error('Invalid PIN');
  }

  // Delete the stored vault key for security
  await clearStoredVaultKey();

  // Update device settings
  await setPINEnabled(false);
}

/**
 * Change PIN: verify old PIN, set new PIN
 */
export async function changePIN(oldPin: string, newPin: string, vaultKey: VaultKey): Promise<void> {
  // First verify the old PIN by trying to retrieve the vault key
  const existingKey = await retrieveVaultKey(oldPin);
  if (!existingKey) {
    throw new Error('Invalid current PIN');
  }

  // Store with new PIN
  await storeVaultKey(vaultKey, newPin);
}

/**
 * Verify PIN and return vault key (for unlock)
 */
export async function verifyPIN(pin: string): Promise<VaultKey | null> {
  return await retrieveVaultKey(pin);
}
