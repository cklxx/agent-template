import Anthropic from "@anthropic-ai/sdk";
import type {
  ContentBlock,
  MessageParam,
  TextBlock,
  TextBlockParam,
  ToolResultBlockParam,
  ToolUseBlock,
  ToolUseBlockParam,
} from "@anthropic-ai/sdk/resources/messages";

import type { AgentConfig } from "./config";
import { BASE_SYSTEM_PROMPT, renderInitialUserPrompt } from "./prompts";
import type { ToolDefinition } from "./tools";

interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

class ToolRegistry {
  private readonly tools: Record<string, ToolDefinition>;
  readonly specs: Array<{ name: string; description: string; input_schema: unknown }>;

  constructor(toolDefinitions: ToolDefinition[]) {
    if (!toolDefinitions.length) {
      throw new Error("At least one tool must be provided");
    }
    this.tools = Object.fromEntries(toolDefinitions.map((tool) => [tool.name, tool]));
    this.specs = toolDefinitions.map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.inputSchema,
    }));
  }

  async execute(name: string, input: Record<string, unknown> | undefined) {
    const tool = this.tools[name];
    if (!tool) {
      throw new Error(`Unknown tool: ${name}`);
    }
    return tool.call(input ?? {});
  }
}

export class ReActAgent {
  private readonly client: Anthropic;
  private readonly registry: ToolRegistry;

  constructor(private readonly config: AgentConfig, tools: ToolDefinition[]) {
    this.client = new Anthropic({
      apiKey: config.apiKey,
      baseURL: config.baseUrl,
    });
    this.registry = new ToolRegistry(tools);
  }

  async run(query: string, options: { debug?: boolean } = {}): Promise<string> {
    const messages: MessageParam[] = [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: renderInitialUserPrompt(query),
          },
        ],
      },
    ];

    const transcript: string[] = [];

    for (let step = 1; step <= this.config.maxSteps; step += 1) {
      const response = await this.client.messages.create({
        model: this.config.model,
        system: BASE_SYSTEM_PROMPT,
        messages,
        max_tokens: this.config.maxTokens,
        temperature: this.config.temperature,
        top_p: this.config.topP,
        top_k: this.config.topK,
        tools: this.registry.specs,
      });

      const textBlocks = extractText(response.content);
      const toolCalls = extractToolCalls(response.content);

      if (options.debug && textBlocks.length) {
        transcript.push(`Step ${step} thought:\n${textBlocks.join("\n")}`);
      }

      messages.push({
        role: "assistant",
        content: response.content.map(toContentParam),
      });

      if (!toolCalls.length) {
        const finalText = textBlocks.join("\n").trim();
        if (options.debug) {
          transcript.push(`Final answer:\n${finalText}`);
          return transcript.join("\n\n");
        }
        return finalText;
      }

      const toolResults: ToolResultBlockParam[] = [];
      for (const call of toolCalls) {
        try {
          const result = await this.registry.execute(call.name, call.input);
          toolResults.push({
            type: "tool_result",
            tool_use_id: call.id,
            content: result,
          });
        } catch (error) {
          toolResults.push({
            type: "tool_result",
            tool_use_id: call.id,
            content: JSON.stringify({
              error: `${call.name} failed: ${String(error)}`,
            }),
          });
        }
      }

      messages.push({
        role: "user",
        content: toolResults,
      });
    }

    throw new Error("Reached the maximum number of steps without a final answer. Increase AGENT_MAX_STEPS if needed.");
  }
}

function extractText(blocks: ContentBlock[]): string[] {
  return blocks
    .filter((block): block is TextBlock => block.type === "text")
    .map((block) => block.text);
}

function extractToolCalls(blocks: ContentBlock[]): ToolCall[] {
  return blocks
    .filter((block): block is ToolUseBlock => block.type === "tool_use")
    .map((block) => ({
      id: block.id,
      name: block.name,
      input: block.input as Record<string, unknown>,
    }));
}

function toContentParam(block: ContentBlock): TextBlockParam | ToolUseBlockParam {
  if (block.type === "text") {
    const textBlock: TextBlockParam = { type: "text", text: block.text };
    return textBlock;
  }
  if (block.type === "tool_use") {
    const toolBlock: ToolUseBlockParam = {
      type: "tool_use",
      id: block.id,
      name: block.name,
      input: block.input,
    };
    return toolBlock;
  }
  throw new Error(`Unsupported content block: ${JSON.stringify(block)}`);
}
