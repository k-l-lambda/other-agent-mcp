export interface AgentOptions {
  systemPrompt?: string;
  maxIterations?: number;
}

export interface ToolCall {
  name: string;
  args: Record<string, unknown>;
  result?: string;
}

export interface AgentResult {
  result: string;
  toolCalls: ToolCall[];
  tokens?: {
    input: number;
    output: number;
    total: number;
  };
}

export interface RunAgentInput {
  prompt: string;
  system_prompt?: string;
  max_iterations?: number;
}
