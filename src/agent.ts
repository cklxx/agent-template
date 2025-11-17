import OpenAI from "openai";
import type {
  ChatCompletionContentPart,
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from "openai/resources/chat/completions";

import type { AgentConfig } from "./config";
import { BASE_SYSTEM_PROMPT, renderInitialUserPrompt } from "./prompts";
import type { ToolDefinition } from "./tools";

interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

interface RunOptions {
  debug?: boolean;
}

interface RunResult {
  answer: string;
  transcript?: string[];
}

class ToolRegistry {
  readonly specs: ChatCompletionTool[];
  private readonly tools: Record<string, ToolDefinition<any>>;

  constructor(toolDefinitions: ToolDefinition<any>[]) {
    if (!toolDefinitions.length) {
      throw new Error("At least one tool must be provided");
    }
    this.tools = Object.fromEntries(toolDefinitions.map((tool) => [tool.name, tool]));
    this.specs = toolDefinitions.map((tool) => ({
      type: "function",
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.inputSchema,
      },
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
  private readonly client: OpenAI;
  private readonly registry: ToolRegistry;

  constructor(private readonly config: AgentConfig, tools: ToolDefinition<any>[]) {
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseUrl,
    });
    this.registry = new ToolRegistry(tools);
  }

  async run(query: string, options: RunOptions = {}): Promise<RunResult> {
    const messages: ChatCompletionMessageParam[] = [
      { role: "system", content: BASE_SYSTEM_PROMPT },
      { role: "user", content: renderInitialUserPrompt(query) },
    ];
    const transcript: string[] = [];
    const captureDebug = Boolean(options.debug);

    for (let step = 1; step <= this.config.maxSteps; step += 1) {
      const completion = await this.client.chat.completions.create({
        model: this.config.model,
        messages,
        temperature: this.config.temperature,
        top_p: this.config.topP,
        max_tokens: this.config.maxTokens,
        tools: this.registry.specs,
      });

      const message = completion.choices[0]?.message;
      if (!message) {
        throw new Error("OpenAI response missing message");
      }

      const text = renderMessageContent(message.content);
      const trimmedThought = text.trim();
      if (captureDebug && trimmedThought) {
        transcript.push(`Step ${step} thought:\n${trimmedThought}`);
      }

      const assistantMessage: ChatCompletionMessageParam = {
        role: "assistant",
        content: message.content ?? "",
      };
      if (message.tool_calls?.length) {
        (assistantMessage as OpenAI.Chat.Completions.ChatCompletionAssistantMessageParam).tool_calls =
          message.tool_calls;
      }
      messages.push(assistantMessage);

      const toolCalls = extractToolCalls(message);
      if (!toolCalls.length) {
        const finalText = trimmedThought;
        if (captureDebug) {
          transcript.push(`Final answer:\n${finalText}`);
          return { answer: finalText, transcript };
        }
        return { answer: finalText };
      }

      for (const call of toolCalls) {
        try {
          if (captureDebug) {
            transcript.push(
              `Step ${step} tool ${call.name} input:\n${formatToolArguments(call.arguments)}`,
            );
          }
          const result = await this.registry.execute(call.name, call.arguments);
          messages.push({
            role: "tool",
            tool_call_id: call.id,
            content: result,
          });
          if (captureDebug) {
            transcript.push(`Step ${step} tool ${call.name} result:\n${summarizeToolResult(result)}`);
          }
        } catch (error) {
          messages.push({
            role: "tool",
            tool_call_id: call.id,
            content: JSON.stringify({ error: `${call.name} failed: ${String(error)}` }),
          });
          if (captureDebug) {
            transcript.push(`Step ${step} tool ${call.name} error:\n${String(error)}`);
          }
        }
      }
    }

    throw new Error("Reached the maximum number of steps without a final answer. Increase AGENT_MAX_STEPS if needed.");
  }
}

function extractToolCalls(message: OpenAI.Chat.Completions.ChatCompletionMessage): ToolCall[] {
  const calls = message.tool_calls;
  if (!calls?.length) {
    return [];
  }
  return calls.map((call) => ({
    id: call.id,
    name: call.function.name,
    arguments: JSON.parse(call.function.arguments || "{}"),
  }));
}

type MessageContent = OpenAI.Chat.Completions.ChatCompletionMessage["content"];
type MessageContentPart = string | ChatCompletionContentPart;

function renderMessageContent(content: MessageContent): string {
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    const parts = content as MessageContentPart[];
    return parts
      .map((part) => {
        if (typeof part === "string") {
          return part;
        }
        if ("text" in part && typeof part.text === "string") {
          return part.text;
        }
        return "";
      })
      .join("")
      .trim();
  }
  return "";
}

function formatToolArguments(args: Record<string, unknown>): string {
  try {
    return JSON.stringify(args, null, 2);
  } catch {
    return String(args);
  }
}

function summarizeToolResult(content: string): string {
  const limit = 1200;
  if (content.length <= limit) {
    return content;
  }
  return `${content.slice(0, limit)}\n... (truncated)`;
}
