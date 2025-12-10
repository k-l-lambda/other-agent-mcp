#!/bin/bash

# Test with Anthropic-compatible API
cd /home/camus/work/other-mcp

# Test the MCP server with Anthropic
echo '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"run_agent","arguments":{"prompt":"What is 2+2? Answer in one word."}},"id":2}' | \
  SUBAGENT_PROVIDER=anthropic \
  SUBAGENT_BASE_URL=https://api.jiekou.ai/anthropic \
  SUBAGENT_API_KEY="sk_a0BXtDJG4h4RbIOq5svxMMbW2ddzL9_63iGXSeP2kbI" \
  SUBAGENT_MODEL=claude-3-5-haiku-latest \
  node dist/index.js
