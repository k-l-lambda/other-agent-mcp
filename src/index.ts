#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { runAgent } from './agent.js';
import { getProviderInfo } from './providers.js';
import type { RunAgentInput } from './types.js';

const server = new McpServer({
  name: 'subagent-mcp',
  version: '1.0.0',
});

// Register the run_agent tool
server.tool(
  'run_agent',
  'Run a LangChain agent with the given prompt. The agent uses the LLM configured via environment variables (SUBAGENT_PROVIDER, SUBAGENT_BASE_URL, SUBAGENT_API_KEY, SUBAGENT_MODEL).',
  {
    prompt: z.string().describe('The task/prompt for the agent to execute'),
    system_prompt: z.string().optional().describe('Optional system prompt for the agent'),
    max_iterations: z.number().optional().describe('Maximum tool call iterations (default: 10)'),
  },
  async (args: RunAgentInput) => {
    try {
      const providerInfo = getProviderInfo();
      console.error(`[subagent-mcp] Running agent with provider: ${providerInfo.provider}, model: ${providerInfo.model}`);

      const result = await runAgent(args.prompt, {
        systemPrompt: args.system_prompt,
        maxIterations: args.max_iterations,
      });

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
      console.error(`[subagent-mcp] Error: ${errorMessage}`);
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

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[subagent-mcp] Server started');
}

main().catch((error) => {
  console.error('[subagent-mcp] Fatal error:', error);
  process.exit(1);
});
