#!/usr/bin/env node

import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load .env from the package directory (not cwd)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
config({ path: join(__dirname, '..', '.env') });

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { runAgent, runAgentWithSession } from './agent.js';
import { getProviderInfo, listAvailableModels } from './providers.js';
import { createSession, getSession, listSessions, deleteSession } from './sessions.js';
import type { RunAgentInput } from './types.js';

const server = new McpServer({
  name: 'other-mcp',
  version: '1.0.0',
});

// Register the run_agent tool
server.tool(
  'run_agent',
  `Run a LangChain agent with the given prompt.

Environment variables:
- SUBAGENT_PROVIDER: 'openai' or 'anthropic' (default: openai)
- SUBAGENT_BASE_URL: API base URL
- SUBAGENT_API_KEY: API key (required)
- SUBAGENT_MODEL: Default model ID
- SUBAGENT_MODELS: JSON dict mapping model names to configs

SUBAGENT_MODELS format:
  Simple: {"qwen":"qwen-max","gpt4o":"gpt-4o-mini"}
  Full: {"qwen":{"provider":"openai","modelId":"qwen-max","baseUrl":"https://..."}}`,
  {
    prompt: z.string().describe('The task/prompt for the agent to execute'),
    system_prompt: z.string().optional().describe('Optional system prompt for the agent'),
    max_iterations: z.number().optional().describe('Maximum tool call iterations (default: 10)'),
    model: z.string().optional().describe('Model name from SUBAGENT_MODELS registry (use list_models to see available)'),
  },
  async (args: RunAgentInput) => {
    try {
      const providerInfo = getProviderInfo(args.model);
      console.error(`[other-mcp] Running agent with provider: ${providerInfo.provider}, model: ${providerInfo.model}${args.model ? ` (name: ${args.model})` : ''}`);

      const result = await runAgent(args.prompt, {
        systemPrompt: args.system_prompt,
        maxIterations: args.max_iterations,
      }, args.model);

      // Format response
      const responseLines = [
        `## Agent Result`,
        '',
        result.result,
        '',
      ];

      if (result.toolCalls.length > 0) {
        responseLines.push('## Tool Calls');
        responseLines.push('');
        for (const tc of result.toolCalls) {
          responseLines.push(`- **${tc.name}**: ${JSON.stringify(tc.args)}`);
          if (tc.result) {
            responseLines.push(`  Result: ${tc.result}`);
          }
        }
        responseLines.push('');
      }

      if (result.tokens) {
        responseLines.push(`## Token Usage`);
        responseLines.push(`- Input: ${result.tokens.input}`);
        responseLines.push(`- Output: ${result.tokens.output}`);
        responseLines.push(`- Total: ${result.tokens.total}`);
      }

      return {
        content: [
          {
            type: 'text' as const,
            text: responseLines.join('\n'),
          },
        ],
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[other-mcp] Error: ${errorMessage}`);
      return {
        content: [
          {
            type: 'text' as const,
            text: `Error running agent: ${errorMessage}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// Register the list_models tool
server.tool(
  'list_models',
  'List all available models configured in SUBAGENT_MODELS environment variable.',
  {},
  async () => {
    try {
      const models = listAvailableModels();

      const lines = [
        '## Available Models',
        '',
        '| Name | Provider | Model ID | Base URL |',
        '|------|----------|----------|----------|',
      ];

      for (const { name, config } of models) {
        const baseUrl = config.baseUrl ? config.baseUrl.substring(0, 40) + (config.baseUrl.length > 40 ? '...' : '') : '(default)';
        lines.push(`| ${name} | ${config.provider} | ${config.modelId} | ${baseUrl} |`);
      }

      lines.push('');
      lines.push('Use the `model` parameter in `run_agent` to select a model by name.');

      return {
        content: [
          {
            type: 'text' as const,
            text: lines.join('\n'),
          },
        ],
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: 'text' as const,
            text: `Error listing models: ${errorMessage}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// ============ Session Management Tools ============

// Create a new session
server.tool(
  'create_session',
  'Create a new conversation session that maintains context across multiple messages.',
  {
    model: z.string().optional().describe('Model name to use for this session (from SUBAGENT_MODELS)'),
    system_prompt: z.string().optional().describe('System prompt for the session'),
  },
  async (args) => {
    try {
      const session = createSession({
        model: args.model,
        systemPrompt: args.system_prompt,
      });

      const lines = [
        '## Session Created',
        '',
        `**Session ID:** \`${session.id}\``,
        `**Model:** ${session.model || '_default'}`,
        session.systemPrompt ? `**System Prompt:** ${session.systemPrompt.substring(0, 100)}${session.systemPrompt.length > 100 ? '...' : ''}` : '',
        '',
        'Use `send_message` with this session_id to continue the conversation.',
      ].filter(Boolean);

      return {
        content: [{ type: 'text' as const, text: lines.join('\n') }],
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: 'text' as const, text: `Error creating session: ${errorMessage}` }],
        isError: true,
      };
    }
  }
);

// Send message to existing session
server.tool(
  'send_message',
  `Send a message to an existing session and get a response. The conversation history is preserved.

Available agent tools:
- read_file: Read file contents with optional line limit
- list_directory: List directory contents with file sizes and modification times
- grep: Search for regex pattern in files, returns matching lines with file paths and line numbers
- glob: Find files matching a glob pattern (e.g., "*.ts", "*.json")
- file_info: Get detailed file/directory metadata (size, permissions, timestamps)

For models that only support single tool (like Gemini), use the 'tools' parameter to specify which tool(s) to enable.`,
  {
    session_id: z.string().describe('The session ID to send the message to'),
    message: z.string().describe('The message to send'),
    enable_tools: z.boolean().optional().default(true).describe('Enable tool calling for the agent (default: true)'),
    tools: z.array(z.string()).optional().describe('List of tool names to enable (e.g., ["list_directory"]). If not specified, all 5 tools are enabled.'),
  },
  async (args) => {
    try {
      const session = getSession(args.session_id);
      if (!session) {
        return {
          content: [{ type: 'text' as const, text: `Session not found: ${args.session_id}` }],
          isError: true,
        };
      }

      const providerInfo = getProviderInfo(session.model);
      console.error(`[other-mcp] Sending message to session ${args.session_id} (model: ${providerInfo.model}, tools: ${args.enable_tools}, toolFilter: ${args.tools?.join(',') || 'all'})`);

      const result = await runAgentWithSession(args.session_id, args.message, args.enable_tools, args.tools);

      const responseLines = [
        '## Response',
        '',
        result.result,
        '',
      ];

      if (result.tokens) {
        responseLines.push(`## Token Usage`);
        responseLines.push(`- Input: ${result.tokens.input}`);
        responseLines.push(`- Output: ${result.tokens.output}`);
        responseLines.push(`- Total: ${result.tokens.total}`);
      }

      // Show message count
      const updatedSession = getSession(args.session_id);
      if (updatedSession) {
        responseLines.push('');
        responseLines.push(`_Session has ${updatedSession.messages.length} messages_`);
      }

      return {
        content: [{ type: 'text' as const, text: responseLines.join('\n') }],
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[other-mcp] Error in send_message: ${errorMessage}`);
      return {
        content: [{ type: 'text' as const, text: `Error sending message: ${errorMessage}` }],
        isError: true,
      };
    }
  }
);

// List all sessions
server.tool(
  'list_sessions',
  'List all active conversation sessions.',
  {},
  async () => {
    try {
      const sessions = listSessions();

      if (sessions.length === 0) {
        return {
          content: [{ type: 'text' as const, text: 'No active sessions.' }],
        };
      }

      const lines = [
        '## Active Sessions',
        '',
        '| Session ID | Model | Messages | Last Active |',
        '|------------|-------|----------|-------------|',
      ];

      for (const session of sessions) {
        const lastActive = new Date(session.lastActiveAt).toISOString();
        lines.push(`| \`${session.id.substring(0, 8)}...\` | ${session.model || '_default'} | ${session.messages.length} | ${lastActive} |`);
      }

      lines.push('');
      lines.push(`Total: ${sessions.length} session(s)`);

      return {
        content: [{ type: 'text' as const, text: lines.join('\n') }],
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: 'text' as const, text: `Error listing sessions: ${errorMessage}` }],
        isError: true,
      };
    }
  }
);

// Get session history
server.tool(
  'get_session_history',
  'Get the conversation history of a specific session.',
  {
    session_id: z.string().describe('The session ID to get history for'),
  },
  async (args) => {
    try {
      const session = getSession(args.session_id);
      if (!session) {
        return {
          content: [{ type: 'text' as const, text: `Session not found: ${args.session_id}` }],
          isError: true,
        };
      }

      const lines = [
        '## Session History',
        '',
        `**Session ID:** \`${session.id}\``,
        `**Model:** ${session.model || '_default'}`,
        `**Created:** ${new Date(session.createdAt).toISOString()}`,
        `**Messages:** ${session.messages.length}`,
        '',
        '---',
        '',
      ];

      for (const msg of session.messages) {
        const roleLabel = msg.role === 'system' ? '🔧 System' : msg.role === 'user' ? '👤 User' : '🤖 Assistant';
        const content = msg.content.length > 500 ? msg.content.substring(0, 500) + '...' : msg.content;
        lines.push(`**${roleLabel}:**`);
        lines.push(content);
        lines.push('');
      }

      return {
        content: [{ type: 'text' as const, text: lines.join('\n') }],
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: 'text' as const, text: `Error getting session history: ${errorMessage}` }],
        isError: true,
      };
    }
  }
);

// Delete session
server.tool(
  'delete_session',
  'Delete a conversation session.',
  {
    session_id: z.string().describe('The session ID to delete'),
  },
  async (args) => {
    try {
      const deleted = deleteSession(args.session_id);
      if (deleted) {
        return {
          content: [{ type: 'text' as const, text: `Session \`${args.session_id}\` deleted successfully.` }],
        };
      } else {
        return {
          content: [{ type: 'text' as const, text: `Session not found: ${args.session_id}` }],
          isError: true,
        };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: 'text' as const, text: `Error deleting session: ${errorMessage}` }],
        isError: true,
      };
    }
  }
);

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[other-mcp] Server started');
}

main().catch((error) => {
  console.error('[other-mcp] Fatal error:', error);
  process.exit(1);
});
