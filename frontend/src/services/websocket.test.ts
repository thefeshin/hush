import { afterEach, beforeEach, describe, expect, it } from 'vitest';

class FakeWebSocket {
  static OPEN = 1;
  static CONNECTING = 0;
  static instances: FakeWebSocket[] = [];

  readyState = FakeWebSocket.CONNECTING;
  onopen: (() => void) | null = null;
  onclose: ((event: { code: number; reason: string }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  sent: string[] = [];

  constructor(_url: string) {
    FakeWebSocket.instances.push(this);
  }

  send(payload: string): void {
    this.sent.push(payload);
  }

  close(code = 1000, reason = 'closed'): void {
    this.readyState = 3;
    this.onclose?.({ code, reason });
  }

  open(): void {
    this.readyState = FakeWebSocket.OPEN;
    this.onopen?.();
  }

  serverMessage(payload: Record<string, unknown>): void {
    this.onmessage?.({ data: JSON.stringify(payload) });
  }
}

describe('WebSocketService message ack handling', () => {
  beforeEach(() => {
    FakeWebSocket.instances = [];
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        location: {
          protocol: 'http:',
          host: 'localhost:3000'
        }
      }
    });
    Object.defineProperty(globalThis, 'WebSocket', {
      configurable: true,
      value: FakeWebSocket
    });
  });

  afterEach(async () => {
    const { wsService } = await import('./websocket');
    wsService.disconnect();
  });

  it('resolves pending send on message_sent ack', async () => {
    const { wsService } = await import('./websocket');

    const connectPromise = wsService.connect();
    const socket = FakeWebSocket.instances[0];
    socket.open();
    await connectPromise;

    const sendPromise = wsService.sendMessage(
      'conversation-1',
      { ciphertext: 'ciphertext', iv: 'iv' },
      'recipient-1'
    );

    const sentPayloadRaw = socket.sent.find((payload) => JSON.parse(payload).type === 'message');
    expect(sentPayloadRaw).toBeTruthy();

    const sentPayload = JSON.parse(sentPayloadRaw as string);
    expect(sentPayload.client_message_id).toBeTruthy();

    socket.serverMessage({
      type: 'message_sent',
      id: 'server-message-id',
      conversation_id: 'conversation-1',
      client_message_id: sentPayload.client_message_id,
      created_at: new Date().toISOString()
    });

    await expect(sendPromise).resolves.toEqual({ id: 'server-message-id' });
  });

  it('includes group_epoch in outgoing group message payload', async () => {
    const { wsService } = await import('./websocket');

    const connectPromise = wsService.connect();
    const socket = FakeWebSocket.instances[0];
    socket.open();
    await connectPromise;

    const sendPromise = wsService.sendMessage(
      'group-conversation-1',
      { ciphertext: 'ciphertext', iv: 'iv' },
      undefined,
      5,
    );

    const sentPayloadRaw = socket.sent.find((payload) => JSON.parse(payload).type === 'message');
    expect(sentPayloadRaw).toBeTruthy();
    const sentPayload = JSON.parse(sentPayloadRaw as string);
    expect(sentPayload.group_epoch).toBe(5);

    socket.serverMessage({
      type: 'message_sent',
      id: 'group-message-id',
      conversation_id: 'group-conversation-1',
      client_message_id: sentPayload.client_message_id,
      created_at: new Date().toISOString(),
    });

    await expect(sendPromise).resolves.toEqual({ id: 'group-message-id' });
  });
});
