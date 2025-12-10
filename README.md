# Subagent MCP

An MCP (Model Context Protocol) server that provides a LangChain.js-powered subagent tool. It allows Claude Code (or any MCP client) to delegate tasks to another LLM.

## Features

- **Multi-provider support**: OpenAI-compatible APIs (Qwen, DeepSeek, local models) and Anthropic-compatible APIs
- **Model registry**: Configure multiple models and switch between them at runtime
- **Simple integration**: Works with Claude Code via `claude mcp add`

## Installation

```bash
cd /path/to/subagent-mcp
npm install
npm run build
```

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `SUBAGENT_PROVIDER` | `openai` or `anthropic` | `openai` |
| `SUBAGENT_BASE_URL` | API base URL | Provider default |
| `SUBAGENT_API_KEY` | API key (required) | - |
| `SUBAGENT_MODEL` | Default model ID | `gpt-4o-mini` / `claude-sonnet-4-20250514` |
| `SUBAGENT_MODELS` | JSON model registry | `{}` |

### Using .env File

Create a `.env` file in the project root:

```bash
# Provider: 'openai' or 'anthropic'
SUBAGENT_PROVIDER=openai

# API endpoint (for OpenAI-compatible APIs)
SUBAGENT_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1

# Your API key
SUBAGENT_API_KEY=sk-your-api-key-here

# Default model
SUBAGENT_MODEL=qwen-max

# Model registry (JSON format)
# Simple format: model name -> model ID
SUBAGENT_MODELS={"qwen-max":"qwen-max","qwen-turbo":"qwen-turbo","qwen-plus":"qwen-plus"}
```

### Model Registry Format

The `SUBAGENT_MODELS` environment variable supports two formats:

**Simple format** - Just map names to model IDs (uses default provider settings):

```json
{
  "qwen": "qwen-max",
  "gpt4o": "gpt-4o-mini",
  "turbo": "qwen-turbo"
}
```

**Full config format** - Override provider/baseUrl per model:

```json
{
  "qwen": {
    "provider": "openai",
    "modelId": "qwen-max",
    "baseUrl": "https://dashscope.aliyuncs.com/compatible-mode/v1",
    "apiKey": "sk-qwen-key"
  },
  "claude": {
    "provider": "anthropic",
    "modelId": "claude-3-5-haiku-latest",
    "baseUrl": "https://api.anthropic.com"
  },
  "local": {
    "provider": "openai",
    "modelId": "llama3",
    "baseUrl": "http://localhost:11434/v1",
    "apiKey": "ollama"
  }
}
```

## Adding to Claude Code

### Basic Setup (Single Model)

```bash
claude mcp add -s user subagent \
  -e "SUBAGENT_PROVIDER=openai" \
  -e "SUBAGENT_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1" \
  -e "SUBAGENT_API_KEY=your-api-key" \
  -e "SUBAGENT_MODEL=qwen-max" \
  -- node /path/to/subagent-mcp/dist/index.js
```

### Multi-Model Setup

```bash
claude mcp add -s user subagent \
  -e "SUBAGENT_PROVIDER=openai" \
  -e "SUBAGENT_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1" \
  -e "SUBAGENT_API_KEY=your-api-key" \
  -e "SUBAGENT_MODEL=qwen-max" \
  -e 'SUBAGENT_MODELS={"qwen-max":"qwen-max","qwen-turbo":"qwen-turbo","qwen-plus":"qwen-plus"}' \
  -- node /path/to/subagent-mcp/dist/index.js
```

### Multi-Provider Setup

For using multiple providers (e.g., both Qwen and local Ollama):

```bash
claude mcp add -s user subagent \
  -e "SUBAGENT_PROVIDER=openai" \
  -e "SUBAGENT_API_KEY=your-qwen-key" \
  -e 'SUBAGENT_MODELS={"qwen":{"provider":"openai","modelId":"qwen-max","baseUrl":"https://dashscope.aliyuncs.com/compatible-mode/v1"},"local":{"provider":"openai","modelId":"llama3","baseUrl":"http://localhost:11434/v1","apiKey":"ollama"}}' \
  -- node /path/to/subagent-mcp/dist/index.js
```

## MCP Tools

### run_agent

Run a LangChain agent with the given prompt.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `prompt` | string | Yes | The task/prompt for the agent |
| `system_prompt` | string | No | System prompt for the agent |
| `max_iterations` | number | No | Max tool iterations (default: 10) |
| `model` | string | No | Model name from SUBAGENT_MODELS |

**Example:**

```
mcp__subagent__run_agent(prompt="Summarize the key points of quantum computing")
mcp__subagent__run_agent(prompt="Translate to Chinese", model="qwen-turbo")
```

### list_models

List all available models configured in SUBAGENT_MODELS.

**Example output:**

```
## Available Models

| Name | Provider | Model ID | Base URL |
|------|----------|----------|----------|
| _default | openai | qwen-max | https://dashscope.aliyuncs.com/compati... |
| qwen-max | openai | qwen-max | (default) |
| qwen-turbo | openai | qwen-turbo | (default) |
| qwen-plus | openai | qwen-plus | (default) |

Use the `model` parameter in `run_agent` to select a model by name.
```

## Provider Examples

### Qwen (Alibaba Cloud)

```bash
SUBAGENT_PROVIDER=openai
SUBAGENT_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
SUBAGENT_API_KEY=sk-your-qwen-key
SUBAGENT_MODEL=qwen-max
```

### DeepSeek

```bash
SUBAGENT_PROVIDER=openai
SUBAGENT_BASE_URL=https://api.deepseek.com/v1
SUBAGENT_API_KEY=sk-your-deepseek-key
SUBAGENT_MODEL=deepseek-chat
```

### OpenAI

```bash
SUBAGENT_PROVIDER=openai
# SUBAGENT_BASE_URL not needed for official OpenAI
SUBAGENT_API_KEY=sk-your-openai-key
SUBAGENT_MODEL=gpt-4o-mini
```

### Anthropic

```bash
SUBAGENT_PROVIDER=anthropic
# SUBAGENT_BASE_URL not needed for official Anthropic
SUBAGENT_API_KEY=sk-ant-your-key
SUBAGENT_MODEL=claude-3-5-haiku-latest
```

### Ollama (Local)

```bash
SUBAGENT_PROVIDER=openai
SUBAGENT_BASE_URL=http://localhost:11434/v1
SUBAGENT_API_KEY=ollama
SUBAGENT_MODEL=llama3
```

## Development

```bash
# Build
npm run build

# Test tools/list
echo '{"jsonrpc":"2.0","method":"tools/list","id":1}' | node dist/index.js

# Test list_models with config
export SUBAGENT_API_KEY=test
export SUBAGENT_MODELS='{"model1":"gpt-4o","model2":"qwen-max"}'
echo '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_models","arguments":{}},"id":2}' | node dist/index.js
```

## License

MIT
