/**
 * Group key derivation using HKDF over (group_id, epoch).
 */

import { stringToBytes } from './encoding';
import type { GroupKey, VaultKey } from '../types/crypto';

const HKDF_INFO = 'hush-group-conversation';

export async function deriveGroupKey(
  vaultKey: VaultKey,
  groupId: string,
  epoch: number,
): Promise<GroupKey> {
  const saltInput = `${groupId}:${epoch}`;
  const salt = stringToBytes(saltInput);
  const saltHash = await crypto.subtle.digest('SHA-256', salt as Uint8Array<ArrayBuffer>);

  const key = await crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new Uint8Array(saltHash) as Uint8Array<ArrayBuffer>,
      info: stringToBytes(HKDF_INFO) as Uint8Array<ArrayBuffer>,
    },
    vaultKey.key,
    {
      name: 'AES-GCM',
      length: 256,
    },
    false,
    ['encrypt', 'decrypt'],
  );

  return {
    key,
    groupId,
    epoch,
  };
}
