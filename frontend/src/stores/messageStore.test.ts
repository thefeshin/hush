import { beforeEach, describe, expect, it, vi } from 'vitest';

const loadMessagesMock = vi.fn();

vi.mock('../services/storage', () => ({
  loadMessages: loadMessagesMock,
}));

describe('messageStore seen-state persistence', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { useMessageStore } = await import('./messageStore');
    useMessageStore.setState({
      messagesByConversation: new Map(),
      isLoading: false,
    });
  });

  it('preserves seen state when reloading stored messages', async () => {
    const { useMessageStore } = await import('./messageStore');

    useMessageStore.getState().addMessage({
      id: 'm1',
      conversationId: 'c1',
      senderId: 'u1',
      senderName: 'alice',
      content: 'hello',
      timestamp: 1000,
      status: 'sent',
      seenByUser: {},
    });
    useMessageStore.getState().markMessageSeen('m1', 'u2', 2000, 1, 1, true, 5000);

    loadMessagesMock.mockResolvedValue([
      {
        id: 'm1',
        encrypted: { ciphertext: 'x', iv: 'y' },
      },
    ]);

    await useMessageStore.getState().loadMessagesForConversation(
      'c1',
      async () => JSON.stringify({
        sender_id: 'u1',
        sender_name: 'alice',
        content: 'hello',
        timestamp: 1000,
      }),
    );

    const message = useMessageStore.getState().getMessages('c1')[0];
    expect(message.seenByUser?.u2).toBe(2000);
    expect(message.seenCount).toBe(1);
    expect(message.totalRecipients).toBe(1);
    expect(message.allRecipientsSeen).toBe(true);
    expect(message.senderDeleteAfterSeenAt).toBe(5000);
  });

  it('does not clear seen state of older messages when new messages arrive', async () => {
    const { useMessageStore } = await import('./messageStore');

    useMessageStore.getState().addMessage({
      id: 'm1',
      conversationId: 'c1',
      senderId: 'u1',
      senderName: 'alice',
      content: 'first',
      timestamp: 1000,
      status: 'sent',
      seenByUser: {},
    });
    useMessageStore.getState().markMessageSeen('m1', 'u2', 2000);

    useMessageStore.getState().addMessage({
      id: 'm2',
      conversationId: 'c1',
      senderId: 'u1',
      senderName: 'alice',
      content: 'second',
      timestamp: 3000,
      status: 'sent',
      seenByUser: {},
    });

    const [first, second] = useMessageStore.getState().getMessages('c1');
    expect(first.id).toBe('m1');
    expect(first.seenByUser?.u2).toBe(2000);
    expect(second.id).toBe('m2');
    expect(second.seenByUser?.u2).toBeUndefined();
  });
});
