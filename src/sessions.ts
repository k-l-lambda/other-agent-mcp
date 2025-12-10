import { randomUUID } from 'crypto';
import { writeFileSync, mkdirSync, existsSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { Session, SessionMessage } from './types.js';

// Get sessions directory path (relative to package root)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SESSIONS_DIR = join(__dirname, '..', 'sessions');

// Ensure sessions directory exists
function ensureSessionsDir(): void {
  if (!existsSync(SESSIONS_DIR)) {
    mkdirSync(SESSIONS_DIR, { recursive: true });
  }
}

// Get markdown file path for a session
function getSessionFilePath(session: Session): string {
  const date = new Date(session.createdAt);
  const prefix = date.getFullYear().toString() +
    (date.getMonth() + 1).toString().padStart(2, '0') +
    date.getDate().toString().padStart(2, '0') + 'T' +
    date.getHours().toString().padStart(2, '0') +
    date.getMinutes().toString().padStart(2, '0') +
    date.getSeconds().toString().padStart(2, '0');
  return join(SESSIONS_DIR, `${prefix}_${session.id}.md`);
}

// Format timestamp for display
function formatTimestamp(ts: number): string {
  return new Date(ts).toISOString().replace('T', ' ').slice(0, 19);
}

// Save session to markdown file
function saveSessionToFile(session: Session): void {
  ensureSessionsDir();

  const lines: string[] = [
    `# Session: ${session.id}`,
    '',
    `- **Model:** ${session.model || '_default'}`,
    `- **Created:** ${formatTimestamp(session.createdAt)}`,
    `- **Last Active:** ${formatTimestamp(session.lastActiveAt)}`,
    '',
    '---',
    '',
  ];

  for (const msg of session.messages) {
    const timestamp = formatTimestamp(msg.timestamp);
    let roleHeader = '';

    switch (msg.role) {
      case 'system':
        roleHeader = `## 🔧 System Prompt`;
        break;
      case 'user':
        roleHeader = `## 👤 User [${timestamp}]`;
        break;
      case 'assistant':
        roleHeader = `## 🤖 Assistant [${timestamp}]`;
        break;
      case 'tool_use':
        roleHeader = `## 🛠️ Tool: ${msg.toolName || 'unknown'} [${timestamp}]`;
        break;
    }

    lines.push(roleHeader);
    lines.push('');

    // For assistant messages, wrap content after first paragraph in <details>
    if (msg.role === 'assistant') {
      const paragraphs = msg.content.split(/\n\n+/);
      if (paragraphs.length > 1) {
        // First paragraph as summary
        lines.push(paragraphs[0]);
        lines.push('');
        lines.push('<details>');
        lines.push('<summary>More details...</summary>');
        lines.push('');
        lines.push(paragraphs.slice(1).join('\n\n'));
        lines.push('');
        lines.push('</details>');
      } else {
        lines.push(msg.content);
      }
    } else if (msg.role === 'tool_use') {
      // Format tool arguments as code block
      if (msg.toolArgs) {
        lines.push('```json');
        lines.push(JSON.stringify(msg.toolArgs, null, 2));
        lines.push('```');
      }
    } else {
      lines.push(msg.content);
    }
    lines.push('');
  }

  writeFileSync(getSessionFilePath(session), lines.join('\n'), 'utf-8');
}

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

  // Save to file
  saveSessionToFile(session);

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

  // Save to file after each message
  saveSessionToFile(session);

  return session;
}

export function addToolUse(sessionId: string, toolName: string, toolArgs: Record<string, unknown>): Session | undefined {
  const session = sessions.get(sessionId);
  if (!session) return undefined;

  const now = Date.now();
  session.messages.push({
    role: 'tool_use',
    content: '',
    timestamp: now,
    toolName,
    toolArgs,
  });
  session.lastActiveAt = now;

  // Save to file after each tool use
  saveSessionToFile(session);

  return session;
}

export function listSessions(): Session[] {
  return Array.from(sessions.values()).sort((a, b) => b.lastActiveAt - a.lastActiveAt);
}

export function deleteSession(sessionId: string): boolean {
  const session = sessions.get(sessionId);

  // Delete the markdown file first (need session for filename)
  if (session) {
    const filePath = getSessionFilePath(session);
    if (existsSync(filePath)) {
      try {
        unlinkSync(filePath);
      } catch {
        // Ignore errors when deleting file
      }
    }
  }

  return sessions.delete(sessionId);
}

export function clearAllSessions(): void {
  sessions.clear();
}

export function getSessionCount(): number {
  return sessions.size;
}

export function getSessionsDir(): string {
  return SESSIONS_DIR;
}
