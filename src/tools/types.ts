export interface ToolDefinition<Input extends Record<string, unknown> = Record<string, unknown>> {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  call: (input: Input) => Promise<string>;
}
