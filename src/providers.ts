import { ChatOpenAI } from '@langchain/openai';
import { ChatAnthropic } from '@langchain/anthropic';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { ModelConfig, ModelsRegistry } from './types.js';

// Parse SUBAGENT_MODELS environment variable
// Format: JSON object with model names as keys
// Example: {"qwen":"qwen-max","gpt4o":"gpt-4o-mini","claude":"claude-sonnet-4-20250514"}
// Or with full config: {"qwen":{"provider":"openai","modelId":"qwen-max","baseUrl":"https://..."}}
function parseModelsRegistry(): ModelsRegistry {
  const modelsEnv = process.env.SUBAGENT_MODELS;
  if (!modelsEnv) {
    return {};
  }

  try {
    const parsed = JSON.parse(modelsEnv);
    const registry: ModelsRegistry = {};

    for (const [name, value] of Object.entries(parsed)) {
      if (typeof value === 'string') {
        // Simple format: just model ID, use default provider settings
        registry[name] = {
          provider: (process.env.SUBAGENT_PROVIDER as 'openai' | 'anthropic') || 'openai',
          modelId: value,
          baseUrl: process.env.SUBAGENT_BASE_URL,
          apiKey: process.env.SUBAGENT_API_KEY,
        };
      } else if (typeof value === 'object' && value !== null) {
        // Full config format
        const config = value as Partial<ModelConfig>;
        registry[name] = {
          provider: config.provider || 'openai',
          modelId: config.modelId || name,
          baseUrl: config.baseUrl || process.env.SUBAGENT_BASE_URL,
          apiKey: config.apiKey || process.env.SUBAGENT_API_KEY,
        };
      }
    }

    return registry;
  } catch (e) {
    console.error('[other-mcp] Failed to parse SUBAGENT_MODELS:', e);
    return {};
  }
}

// Get model config by name, or use default if not found
function getModelConfig(modelName?: string): ModelConfig {
  const registry = parseModelsRegistry();

  if (modelName && registry[modelName]) {
    return registry[modelName];
  }

  // Fall back to default config from environment variables
  return {
    provider: (process.env.SUBAGENT_PROVIDER as 'openai' | 'anthropic') || 'openai',
    modelId: process.env.SUBAGENT_MODEL ||
      (process.env.SUBAGENT_PROVIDER === 'anthropic' ? 'claude-sonnet-4-20250514' : 'gpt-4o-mini'),
    baseUrl: process.env.SUBAGENT_BASE_URL,
    apiKey: process.env.SUBAGENT_API_KEY,
  };
}

export function createChatModel(modelName?: string): BaseChatModel {
  const config = getModelConfig(modelName);

  if (!config.apiKey) {
    throw new Error('API key is required. Set SUBAGENT_API_KEY or specify apiKey in model config.');
  }

  if (config.provider === 'anthropic') {
    return new ChatAnthropic({
      anthropicApiKey: config.apiKey,
      model: config.modelId,
      ...(config.baseUrl && { anthropicApiUrl: config.baseUrl }),
    });
  } else {
    // OpenAI or OpenAI-compatible (Qwen, local models, etc.)
    return new ChatOpenAI({
      apiKey: config.apiKey,
      model: config.modelId,
      configuration: {
        baseURL: config.baseUrl,
      },
    });
  }
}

export function getProviderInfo(modelName?: string): { provider: string; model: string; baseUrl?: string; modelName?: string } {
  const config = getModelConfig(modelName);
  return {
    provider: config.provider,
    model: config.modelId,
    baseUrl: config.baseUrl,
    modelName: modelName,
  };
}

export function listAvailableModels(): { name: string; config: ModelConfig }[] {
  const registry = parseModelsRegistry();
  const models: { name: string; config: ModelConfig }[] = [];

  // Add default model
  const defaultConfig = getModelConfig();
  models.push({
    name: '_default',
    config: defaultConfig,
  });

  // Add registered models
  for (const [name, config] of Object.entries(registry)) {
    models.push({ name, config });
  }

  return models;
}
