/**
 * Message list with auto-scroll
 */

import { useEffect, useRef } from 'react';
import { AlertTriangle, Check, CheckCheck, Loader2 } from 'lucide-react';

interface Message {
  id: string;
  senderId: string;
  senderName: string;
  content: string;
  timestamp: number;
  expiresAfterSeenSec?: 15 | 30 | 60;
  seenByUser?: Record<string, number>;
  deleteAfterSeenAt?: number;
  senderDeleteAfterSeenAt?: number;
  seenCount?: number;
  totalRecipients?: number;
  allRecipientsSeen?: boolean;
  status: 'sending' | 'sent' | 'failed';
}

interface Props {
  messages: Message[];
  currentUserId: string;
  onMessageVisible?: (messageId: string) => void;
}

export function MessageList({ messages, currentUserId, onMessageVisible }: Props) {
  const listRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const seenReportedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  useEffect(() => {
    if (!onMessageVisible || !listRef.current) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting || entry.intersectionRatio < 0.6) {
            continue;
          }

          const element = entry.target as HTMLElement;
          const messageId = element.dataset.messageId;
          const isOwn = element.dataset.own === 'true';
          const isAlreadySeen = element.dataset.seen === 'true';

          if (!messageId || isOwn || isAlreadySeen || seenReportedRef.current.has(messageId)) {
            continue;
          }

          seenReportedRef.current.add(messageId);
          onMessageVisible(messageId);
          observer.unobserve(element);
        }
      },
      {
        root: listRef.current,
        threshold: [0.6],
      },
    );

    const messageElements = listRef.current.querySelectorAll<HTMLElement>('[data-message-id]');
    messageElements.forEach((element) => observer.observe(element));

    return () => {
      observer.disconnect();
    };
  }, [messages, onMessageVisible]);

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center text-text-secondary">
        <div>
          <p>No messages yet</p>
          <p className="mt-2 text-caption">Send a message to start the conversation</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-4" ref={listRef}>
      {messages.map((message, index) => {
        const isOwn = message.senderId === currentUserId;
        const showSender = !isOwn && (
          index === 0 ||
          messages[index - 1].senderId !== message.senderId
        );

        const messageContainerClass = `flex max-w-[85%] flex-col md:max-w-[70%] ${isOwn ? 'self-end' : 'self-start'} ${message.status === 'sending' ? 'opacity-70' : ''}`;
        const bubbleClass = `break-words rounded-2xl px-4 py-3 ${isOwn ? 'rounded-br bg-accent text-zinc-900' : 'rounded-bl bg-bg-tertiary'} ${message.status === 'failed' ? 'border border-error' : ''}`;
        const metaClass = `mt-1 flex justify-end gap-2 text-caption ${isOwn ? 'text-zinc-700' : 'text-text-secondary'}`;

        return (
          <div
            key={message.id}
            className={messageContainerClass}
            data-message-id={message.id}
            data-own={isOwn ? 'true' : 'false'}
            data-seen={message.seenByUser?.[currentUserId] ? 'true' : 'false'}
          >
            {showSender && (
              <div className="mb-1 ml-2 text-caption text-text-secondary">{message.senderName}</div>
            )}
            <div className={bubbleClass}>
              <div className="whitespace-pre-wrap break-words">{message.content}</div>
              <div className={metaClass}>
                <span>{formatTime(message.timestamp)}</span>
                {isOwn && message.senderDeleteAfterSeenAt && (
                  <span>
                    {Math.max(0, Math.ceil((message.senderDeleteAfterSeenAt - Date.now()) / 1000))}s
                  </span>
                )}
                {!isOwn && message.deleteAfterSeenAt && (
                  <span>
                    {Math.max(0, Math.ceil((message.deleteAfterSeenAt - Date.now()) / 1000))}s
                  </span>
                )}
                {isOwn && (
                  <span className="inline-flex items-center">
                    {message.status === 'sending' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    {message.status === 'sent' && (
                      message.seenByUser && Object.keys(message.seenByUser).length > 0
                        ? <CheckCheck className="h-3.5 w-3.5" />
                        : <Check className="h-3.5 w-3.5" />
                    )}
                    {message.status === 'failed' && <AlertTriangle className="h-3.5 w-3.5" />}
                  </span>
                )}
              </div>
            </div>
          </div>
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}
