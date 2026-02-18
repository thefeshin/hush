import { wsService } from '../services/websocket';
import { saveConversation } from '../services/storage';
import type { ConversationMetadata } from '../types/crypto';

export interface GroupStateLite {
  name: string;
  key_epoch: number;
  created_by: string;
  members: Array<{ user_id: string }>;
}

interface EnsureGroupConversationVisibleParams {
  user: { id: string; username: string };
  conversationId: string;
  fallbackName?: string;
  fallbackEpoch?: number;
  getConversation: (conversationId: string) => {
    conversationId: string;
    kind: 'direct' | 'group';
    participantId: string;
    participantUsername: string;
    keyEpoch?: number;
    createdAt: number;
    lastMessageAt: number;
    unreadCount: number;
  } | undefined;
  upsertConversation: (conversation: {
    conversationId: string;
    kind: 'direct' | 'group';
    participantId: string;
    participantUsername: string;
    keyEpoch?: number;
    createdAt: number;
    lastMessageAt: number;
    unreadCount: number;
  }) => void;
  getGroupState: (conversationId: string) => Promise<GroupStateLite>;
  encryptIdentity: (data: ConversationMetadata) => Promise<{ ciphertext: string; iv: string }>;
}

export async function ensureGroupConversationVisible({
  user,
  conversationId,
  fallbackName,
  fallbackEpoch,
  getConversation,
  upsertConversation,
  getGroupState,
  encryptIdentity,
}: EnsureGroupConversationVisibleParams): Promise<void> {
  const existing = getConversation(conversationId);
  if (existing) {
    if (existing.kind === 'group') {
      const nextEpoch = fallbackEpoch && fallbackEpoch > 0
        ? fallbackEpoch
        : (existing.keyEpoch || 1);
      if ((existing.keyEpoch || 1) !== nextEpoch) {
        upsertConversation({
          ...existing,
          keyEpoch: nextEpoch,
        });
      }
    }
    return;
  }

  let groupState: GroupStateLite | null = null;
  try {
    groupState = await getGroupState(conversationId);
  } catch {
    // Group state may not be readable immediately.
  }

  const groupName = groupState?.name || fallbackName || `Group ${conversationId.slice(0, 8)}`;
  const keyEpoch = groupState?.key_epoch || fallbackEpoch || 1;
  const now = Date.now();

  const metadata: ConversationMetadata = {
    participants: groupState?.members?.map((member) => member.user_id) || [user.id],
    kind: 'group',
    group_name: groupName,
    key_epoch: keyEpoch,
    created_by: {
      user_id: groupState?.created_by || user.id,
      display_name: groupState?.created_by === user.id ? user.username : groupName,
    },
    created_at: now,
  };

  const encryptedMetadata = await encryptIdentity(metadata);
  await saveConversation(conversationId, encryptedMetadata, now);

  upsertConversation({
    conversationId,
    kind: 'group',
    participantId: '',
    participantUsername: groupName,
    keyEpoch,
    createdAt: now,
    lastMessageAt: now,
    unreadCount: 0,
  });

  wsService.subscribe(conversationId);
}
