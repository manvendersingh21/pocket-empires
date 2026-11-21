import type { ClientMessage, ServerMessage } from '../shared/messages.js';

/** Pure READY -> ACK handler. Returns null for anything else. */
export function handleClientMessage(message: unknown): ServerMessage | null {
  const msg = message as Partial<ClientMessage> | null;
  if (msg?.type === 'READY') {
    return { type: 'ACK', app: 'momentum', version: 1, received: 'READY' };
  }
  return null;
}
