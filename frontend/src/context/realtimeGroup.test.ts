import { beforeEach, describe, expect, it, vi } from 'vitest';

const subscribeMock = vi.fn();
const saveConversationMock = vi.fn();

vi.mock('../services/websocket', () => ({
  wsService: {
    subscribe: subscribeMock,
  },
}));

vi.mock('../services/storage', () => ({
  saveConversation: saveConversationMock,
}));

describe('ensureGroupConversationVisible', () => {
  beforeEach(() => {
    subscribeMock.mockReset();
    saveConversationMock.mockReset();
  });

  it('creates and subscribes unknown group from realtime event', async () => {
    const upsertConversation = vi.fn();
    const getConversation = vi.fn().mockReturnValue(undefined);
    const getGroupState = vi.fn().mockResolvedValue({
      name: 'Red Team',
      key_epoch: 4,
      created_by: 'owner-1',
      members: [{ user_id: 'user-1' }, { user_id: 'owner-1' }],
    });
    const encryptIdentity = vi.fn().mockResolvedValue({
      ciphertext: 'cipher',
      iv: 'iv',
    });

    const { ensureGroupConversationVisible } = await import('./realtimeGroup');

    await ensureGroupConversationVisible({
      user: { id: 'user-1', username: 'alice' },
      conversationId: 'group-1',
      fallbackName: 'Fallback Name',
      fallbackEpoch: 2,
      getConversation,
      upsertConversation,
      getGroupState,
      encryptIdentity,
    });

    expect(getGroupState).toHaveBeenCalledWith('group-1');
    expect(encryptIdentity).toHaveBeenCalledTimes(1);
    expect(saveConversationMock).toHaveBeenCalledTimes(1);
    expect(upsertConversation).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: 'group-1',
        kind: 'group',
        participantUsername: 'Red Team',
        keyEpoch: 4,
      }),
    );
    expect(subscribeMock).toHaveBeenCalledWith('group-1');
  });

  it('only updates key epoch for existing group', async () => {
    const existing = {
      conversationId: 'group-2',
      kind: 'group' as const,
      participantId: '',
      participantUsername: 'Ops',
      keyEpoch: 2,
      createdAt: 1,
      lastMessageAt: 1,
      unreadCount: 0,
    };
    const getConversation = vi.fn().mockReturnValue(existing);
    const upsertConversation = vi.fn();
    const getGroupState = vi.fn();
    const encryptIdentity = vi.fn();

    const { ensureGroupConversationVisible } = await import('./realtimeGroup');

    await ensureGroupConversationVisible({
      user: { id: 'user-1', username: 'alice' },
      conversationId: 'group-2',
      fallbackEpoch: 5,
      getConversation,
      upsertConversation,
      getGroupState: getGroupState as never,
      encryptIdentity: encryptIdentity as never,
    });

    expect(upsertConversation).toHaveBeenCalledWith({
      ...existing,
      keyEpoch: 5,
    });
    expect(getGroupState).not.toHaveBeenCalled();
    expect(encryptIdentity).not.toHaveBeenCalled();
    expect(saveConversationMock).not.toHaveBeenCalled();
    expect(subscribeMock).not.toHaveBeenCalled();
  });
});
