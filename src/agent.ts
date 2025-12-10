import { createChatModel } from './providers.js';
import type { AgentOptions, AgentResult, ToolCall } from './types.js';
import { HumanMessage, SystemMessage, AIMessage, ToolMessage } from '@langchain/core/messages';
import type { AIMessageChunk } from '@langchain/core/messages';
import { getSession, addMessage, addToolUse } from './sessions.js';
import { allTools } from './tools.js';

// Run agent with tools (stateless)
export async function runAgent(prompt: string, options: AgentOptions = {}, modelName?: string): Promise<AgentResult> {
  const model = createChatModel(modelName);
  const { systemPrompt, maxIterations = 10, enableTools = true } = options;

  const messages: (HumanMessage | SystemMessage | AIMessage | ToolMessage)[] = [];

  if (systemPrompt) {
    messages.push(new SystemMessage(systemPrompt));
  }
  messages.push(new HumanMessage(prompt));

  const toolCalls: ToolCall[] = [];
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  // Bind tools to model if enabled
  const boundModel = enableTools && model.bindTools ? model.bindTools(allTools) : model;

  // Agent loop with tool calling
  for (let i = 0; i < maxIterations; i++) {
    const response = await boundModel.invoke(messages) as AIMessageChunk;

    // Accumulate token usage
    const usage = response.usage_metadata;
    if (usage) {
      totalInputTokens += usage.input_tokens || 0;
      totalOutputTokens += usage.output_tokens || 0;
    }

    // Check if there are tool calls
    if (response.tool_calls && response.tool_calls.length > 0) {
      messages.push(response);

      // Execute each tool call
      for (const tc of response.tool_calls) {
        const tool = allTools.find(t => t.name === tc.name);
        if (tool) {
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const result = await (tool as any).invoke(tc.args);
            toolCalls.push({
              name: tc.name,
              args: tc.args as Record<string, unknown>,
              result: String(result),
            });
            messages.push(new ToolMessage({
              tool_call_id: tc.id || '',
              content: String(result),
            }));
          } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            toolCalls.push({
              name: tc.name,
              args: tc.args as Record<string, unknown>,
              result: `Error: ${errorMsg}`,
            });
            messages.push(new ToolMessage({
              tool_call_id: tc.id || '',
              content: `Error: ${errorMsg}`,
            }));
          }
        }
      }
    } else {
      // No tool calls, extract final response
      let resultText = '';
      if (typeof response.content === 'string') {
        resultText = response.content;
      } else if (Array.isArray(response.content)) {
        resultText = response.content
          .map(block => {
            if (typeof block === 'string') return block;
            if ('text' in block) return (block as { text: string }).text;
            return '';
          })
          .join('');
      }

      return {
        result: resultText,
        toolCalls,
        tokens: {
          input: totalInputTokens,
          output: totalOutputTokens,
          total: totalInputTokens + totalOutputTokens,
        },
      };
    }
  }

  // Max iterations reached
  return {
    result: '[Max iterations reached]',
    toolCalls,
    tokens: {
      input: totalInputTokens,
      output: totalOutputTokens,
      total: totalInputTokens + totalOutputTokens,
    },
  };
}

// Run agent with session context (maintains conversation history)
export async function runAgentWithSession(sessionId: string, prompt: string, enableTools: boolean = true): Promise<AgentResult> {
  const session = getSession(sessionId);
  if (!session) {
    throw new Error(`Session not found: ${sessionId}`);
  }

  const model = createChatModel(session.model);

  // Build messages from session history
  const messages: (HumanMessage | SystemMessage | AIMessage | ToolMessage)[] = [];

  for (const msg of session.messages) {
    if (msg.role === 'system') {
      messages.push(new SystemMessage(msg.content));
    } else if (msg.role === 'user') {
      messages.push(new HumanMessage(msg.content));
    } else if (msg.role === 'assistant') {
      messages.push(new AIMessage(msg.content));
    }
  }

  // Add the new user message
  messages.push(new HumanMessage(prompt));
  addMessage(sessionId, 'user', prompt);

  const toolCalls: ToolCall[] = [];
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  // Bind tools to model if enabled
  const boundModel = enableTools && model.bindTools ? model.bindTools(allTools) : model;
  const maxIterations = 10;

  // Agent loop with tool calling
  for (let i = 0; i < maxIterations; i++) {
    const response = await boundModel.invoke(messages) as AIMessageChunk;

    // Accumulate token usage
    const usage = response.usage_metadata;
    if (usage) {
      totalInputTokens += usage.input_tokens || 0;
      totalOutputTokens += usage.output_tokens || 0;
    }

    // Check if there are tool calls
    if (response.tool_calls && response.tool_calls.length > 0) {
      messages.push(response);

      // Execute each tool call
      for (const tc of response.tool_calls) {
        const tool = allTools.find(t => t.name === tc.name);
        if (tool) {
          // Record tool use to session (before execution)
          addToolUse(sessionId, tc.name, tc.args as Record<string, unknown>);

          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const result = await (tool as any).invoke(tc.args);
            toolCalls.push({
              name: tc.name,
              args: tc.args as Record<string, unknown>,
              result: String(result),
            });
            messages.push(new ToolMessage({
              tool_call_id: tc.id || '',
              content: String(result),
            }));
          } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            toolCalls.push({
              name: tc.name,
              args: tc.args as Record<string, unknown>,
              result: `Error: ${errorMsg}`,
            });
            messages.push(new ToolMessage({
              tool_call_id: tc.id || '',
              content: `Error: ${errorMsg}`,
            }));
          }
        }
      }
    } else {
      // No tool calls, extract final response
      let resultText = '';
      if (typeof response.content === 'string') {
        resultText = response.content;
      } else if (Array.isArray(response.content)) {
        resultText = response.content
          .map(block => {
            if (typeof block === 'string') return block;
            if ('text' in block) return (block as { text: string }).text;
            return '';
          })
          .join('');
      }

      // Save assistant response to session
      addMessage(sessionId, 'assistant', resultText);

      return {
        result: resultText,
        toolCalls,
        tokens: {
          input: totalInputTokens,
          output: totalOutputTokens,
          total: totalInputTokens + totalOutputTokens,
        },
      };
    }
  }

  // Max iterations reached
  const resultText = '[Max iterations reached]';
  addMessage(sessionId, 'assistant', resultText);

  return {
    result: resultText,
    toolCalls,
    tokens: {
      input: totalInputTokens,
      output: totalOutputTokens,
      total: totalInputTokens + totalOutputTokens,
    },
  };
}
