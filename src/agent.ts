import { createChatModel } from './providers.js';
import type { AgentOptions, AgentResult, ToolCall } from './types.js';
import { HumanMessage, SystemMessage, AIMessage } from '@langchain/core/messages';

export async function runAgent(prompt: string, options: AgentOptions = {}): Promise<AgentResult> {
  const model = createChatModel();
  const { systemPrompt, maxIterations = 10 } = options;

  const messages: (HumanMessage | SystemMessage | AIMessage)[] = [];

  if (systemPrompt) {
    messages.push(new SystemMessage(systemPrompt));
  }
  messages.push(new HumanMessage(prompt));

  const toolCalls: ToolCall[] = [];
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  // Simple agent loop - for now just a single LLM call
  // In future, this can be extended to support tool calling
  const response = await model.invoke(messages);

  // Extract content from response
  let resultText = '';
  if (typeof response.content === 'string') {
    resultText = response.content;
  } else if (Array.isArray(response.content)) {
    resultText = response.content
      .map(block => {
        if (typeof block === 'string') return block;
        if ('text' in block) return block.text;
        return '';
      })
      .join('');
  }

  // Extract token usage if available
  const usage = response.usage_metadata;
  if (usage) {
    totalInputTokens = usage.input_tokens || 0;
    totalOutputTokens = usage.output_tokens || 0;
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
