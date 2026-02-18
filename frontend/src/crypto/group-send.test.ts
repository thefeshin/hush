import { describe, expect, it, vi } from 'vitest';
import { ensureGroupSendReadiness } from './group-send';

describe('ensureGroupSendReadiness', () => {
  it('returns ok when envelope exists and epoch matches', async () => {
    const getGroupState = vi.fn().mockResolvedValue({
      id: 'g1',
      conversation_id: 'g1',
      name: 'Ops',
      created_by: 'u1',
      key_epoch: 3,
      members: [],
      my_encrypted_key_envelope: 'enc',
    });

    const result = await ensureGroupSendReadiness('g1', 3, getGroupState);
    expect(result).toEqual({ ok: true, epoch: 3 });
  });

  it('returns missing_envelope when envelope absent', async () => {
    const getGroupState = vi.fn().mockResolvedValue({
      id: 'g1',
      conversation_id: 'g1',
      name: 'Ops',
      created_by: 'u1',
      key_epoch: 2,
      members: [],
      my_encrypted_key_envelope: null,
    });

    const result = await ensureGroupSendReadiness('g1', 2, getGroupState);
    expect(result).toEqual({ ok: false, reason: 'missing_envelope' });
  });

  it('returns stale_epoch and latest epoch when mismatch', async () => {
    const getGroupState = vi.fn().mockResolvedValue({
      id: 'g1',
      conversation_id: 'g1',
      name: 'Ops',
      created_by: 'u1',
      key_epoch: 5,
      members: [],
      my_encrypted_key_envelope: 'enc',
    });

    const result = await ensureGroupSendReadiness('g1', 4, getGroupState);
    expect(result).toEqual({ ok: false, reason: 'stale_epoch', epoch: 5 });
  });

  it('retries and returns unavailable when state fetch fails twice', async () => {
    const getGroupState = vi.fn()
      .mockRejectedValueOnce(new Error('temp'))
      .mockRejectedValueOnce(new Error('down'));

    const result = await ensureGroupSendReadiness('g1', 1, getGroupState);
    expect(result).toEqual({ ok: false, reason: 'state_unavailable' });
    expect(getGroupState).toHaveBeenCalledTimes(2);
  });
});
