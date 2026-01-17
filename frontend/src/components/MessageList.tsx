/**
 * Message list with auto-scroll
 */

import React, { useEffect, useRef } from 'react';

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

  // Auto-scroll to bottom on new messages
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
      <div className="message-list empty">
        <div className="empty-messages">
          <p>No messages yet</p>
          <p className="hint">Send a message to start the conversation</p>
        </div>
      </div>
    );
  }

  return (
    <div className="message-list" ref={listRef}>
      {messages.map((message, index) => {
        const isOwn = message.senderId === currentUserId;
        const showSender = !isOwn && (
          index === 0 ||
          messages[index - 1].senderId !== message.senderId
        );

        return (
          <div
            key={message.id}
            className={`message ${isOwn ? 'own' : 'other'} ${message.status}`}
          >
            {showSender && (
              <div className="message-sender">{message.senderName}</div>
            )}
            <div className="message-bubble">
              <div className="message-content">{message.content}</div>
              <div className="message-meta">
                <span className="message-time">{formatTime(message.timestamp)}</span>
                {isOwn && (
                  <span className="message-status">
                    {message.status === 'sending' && '\u23F3'}
                    {message.status === 'sent' && '\u2713'}
                    {message.status === 'failed' && '\u26A0'}
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
