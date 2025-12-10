import { randomUUID } from 'crypto';
import type { Session, SessionMessage } from './types.js';

// In-memory session storage
const sessions = new Map<string, Session>();

export function createSession(options: { model?: string; systemPrompt?: string } = {}): Session {
  const id = randomUUID();
  const now = Date.now();

  const session: Session = {
    id,
    model: options.model,
    systemPrompt: options.systemPrompt,
    messages: [],
    createdAt: now,
    lastActiveAt: now,
  };

  // Add system prompt as first message if provided
  if (options.systemPrompt) {
    session.messages.push({
      role: 'system',
      content: options.systemPrompt,
      timestamp: now,
    });
  }

  sessions.set(id, session);
  return session;
}

export function getSession(sessionId: string): Session | undefined {
  return sessions.get(sessionId);
}

export function addMessage(sessionId: string, role: 'user' | 'assistant', content: string): Session | undefined {
  const session = sessions.get(sessionId);
  if (!session) return undefined;

  const now = Date.now();
  session.messages.push({
    role,
    content,
    timestamp: now,
  });
  session.lastActiveAt = now;

  return session;
}

export function listSessions(): Session[] {
  return Array.from(sessions.values()).sort((a, b) => b.lastActiveAt - a.lastActiveAt);
}

export function deleteSession(sessionId: string): boolean {
  return sessions.delete(sessionId);
}

export function clearAllSessions(): void {
  sessions.clear();
}

export function getSessionCount(): number {
  return sessions.size;
}
