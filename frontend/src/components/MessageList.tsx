/**
 * Message list with auto-scroll
 */

import { useEffect, useRef } from 'react';
import { AlertTriangle, Check, Loader2 } from 'lucide-react';

interface Message {
  id: string;
  senderId: string;
  senderName: string;
  content: string;
  timestamp: number;
  status: 'sending' | 'sent' | 'failed';
}

interface Props {
  messages: Message[];
  currentUserId: string;
}

export function MessageList({ messages, currentUserId }: Props) {
  const listRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

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
          <div key={message.id} className={messageContainerClass}>
            {showSender && (
              <div className="mb-1 ml-2 text-caption text-text-secondary">{message.senderName}</div>
            )}
            <div className={bubbleClass}>
              <div className="whitespace-pre-wrap break-words">{message.content}</div>
              <div className={metaClass}>
                <span>{formatTime(message.timestamp)}</span>
                {isOwn && (
                  <span className="inline-flex items-center">
                    {message.status === 'sending' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    {message.status === 'sent' && <Check className="h-3.5 w-3.5" />}
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
