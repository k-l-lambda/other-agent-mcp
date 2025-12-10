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
import { runAgent } from './agent.js';
import { getProviderInfo, listAvailableModels } from './providers.js';
import type { RunAgentInput } from './types.js';

const server = new McpServer({
  name: 'subagent-mcp',
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
      console.error(`[subagent-mcp] Running agent with provider: ${providerInfo.provider}, model: ${providerInfo.model}${args.model ? ` (name: ${args.model})` : ''}`);

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
