import type { GroupState } from '../services/api';

export interface GroupSendReadiness {
  ok: boolean;
  epoch?: number;
  reason?: 'missing_envelope' | 'stale_epoch' | 'state_unavailable';
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function ensureGroupSendReadiness(
  groupId: string,
  expectedEpoch: number,
  getGroupState: (groupId: string) => Promise<GroupState>,
): Promise<GroupSendReadiness> {
  let state: GroupState | null = null;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      state = await getGroupState(groupId);
      break;
    } catch {
      if (attempt === 2) {
        return { ok: false, reason: 'state_unavailable' };
      }
      await sleep(200 * attempt);
    }
  }

  if (!state) {
    return { ok: false, reason: 'state_unavailable' };
  }

  if (!state.my_encrypted_key_envelope) {
    return { ok: false, reason: 'missing_envelope' };
  }

  if ((state.key_epoch || 1) !== (expectedEpoch || 1)) {
    return { ok: false, reason: 'stale_epoch', epoch: state.key_epoch || 1 };
  }

  return { ok: true, epoch: state.key_epoch || 1 };
}
