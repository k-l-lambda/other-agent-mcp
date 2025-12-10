import { ChatOpenAI } from '@langchain/openai';
import { ChatAnthropic } from '@langchain/anthropic';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';

export function createChatModel(): BaseChatModel {
  const provider = process.env.SUBAGENT_PROVIDER || 'openai';
  const baseUrl = process.env.SUBAGENT_BASE_URL;
  const apiKey = process.env.SUBAGENT_API_KEY;
  const model = process.env.SUBAGENT_MODEL;

  if (!apiKey) {
    throw new Error('SUBAGENT_API_KEY environment variable is required');
  }

  if (provider === 'anthropic') {
    return new ChatAnthropic({
      anthropicApiKey: apiKey,
      model: model || 'claude-sonnet-4-20250514',
      ...(baseUrl && { anthropicApiUrl: baseUrl }),
    });
  } else {
    // OpenAI or OpenAI-compatible (Qwen, local models, etc.)
    return new ChatOpenAI({
      apiKey: apiKey,
      model: model || 'gpt-4o-mini',
      configuration: {
        baseURL: baseUrl,
      },
    });
  }
}

export function getProviderInfo(): { provider: string; model: string; baseUrl?: string } {
  return {
    provider: process.env.SUBAGENT_PROVIDER || 'openai',
    model: process.env.SUBAGENT_MODEL || (process.env.SUBAGENT_PROVIDER === 'anthropic' ? 'claude-sonnet-4-20250514' : 'gpt-4o-mini'),
    baseUrl: process.env.SUBAGENT_BASE_URL,
  };
}
