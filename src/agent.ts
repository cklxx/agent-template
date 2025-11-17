import OpenAI from "openai";
import type {
  ChatCompletionContentPart,
  ChatCompletionMessage,
  ChatCompletionMessageParam,
  ChatCompletionMessageToolCall,
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
  streamObserver?: AgentStreamObserver;
}

interface RunResult {
  answer: string;
  transcript?: string[];
}

export type AgentStreamEvent =
  | {
      type: "step_started";
      step: number;
    }
  | {
      type: "message_chunk";
      step: number;
      chunk: string;
    }
  | {
      type: "message_completed";
      step: number;
      content: string;
      trimmedContent: string;
      toolCalls: ToolCall[];
      isFinal: boolean;
    }
  | {
      type: "tool_call";
      step: number;
      call: ToolCall;
    }
  | {
      type: "tool_result";
      step: number;
      call: ToolCall;
      result: string;
      isError: boolean;
    }
  | {
      type: "run_completed";
      answer: string;
    };

export type AgentStreamObserver = (event: AgentStreamEvent) => void | Promise<void>;

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
    const observer = options.streamObserver;

    for (let step = 1; step <= this.config.maxSteps; step += 1) {
      await observer?.({ type: "step_started", step });
      const message = await this.createStreamingCompletion(messages, {
        onContentChunk: async (chunk) => {
          if (chunk) {
            await observer?.({ type: "message_chunk", step, chunk });
          }
        },
      });

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
      await observer?.({
        type: "message_completed",
        step,
        content: text,
        trimmedContent: trimmedThought,
        toolCalls,
        isFinal: toolCalls.length === 0,
      });
      if (!toolCalls.length) {
        const finalText = trimmedThought;
        if (captureDebug) {
          transcript.push(`Final answer:\n${finalText}`);
        }
        await observer?.({ type: "run_completed", answer: finalText });
        if (captureDebug) {
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
          await observer?.({ type: "tool_call", step, call });
          const result = await this.registry.execute(call.name, call.arguments);
          messages.push({
            role: "tool",
            tool_call_id: call.id,
            content: result,
          });
          await observer?.({ type: "tool_result", step, call, result, isError: false });
          if (captureDebug) {
            transcript.push(`Step ${step} tool ${call.name} result:\n${summarizeToolResult(result)}`);
          }
        } catch (error) {
          const errorMessage = `${call.name} failed: ${String(error)}`;
          await observer?.({ type: "tool_result", step, call, result: errorMessage, isError: true });
          messages.push({
            role: "tool",
            tool_call_id: call.id,
            content: JSON.stringify({ error: errorMessage }),
          });
          if (captureDebug) {
            transcript.push(`Step ${step} tool ${call.name} error:\n${String(error)}`);
          }
        }
      }
    }

    throw new Error("Reached the maximum number of steps without a final answer. Increase AGENT_MAX_STEPS if needed.");
  }

  private async createStreamingCompletion(
    messages: ChatCompletionMessageParam[],
    callbacks?: CollectStreamCallbacks,
  ) {
    const stream = await this.client.chat.completions.create({
      model: this.config.model,
      messages,
      temperature: this.config.temperature,
      top_p: this.config.topP,
      max_tokens: this.config.maxTokens,
      tools: this.registry.specs,
      stream: true,
    });
    return collectStream(stream, callbacks);
  }
}

type ToolCallAccumulator = {
  id?: string;
  type?: "function";
  function?: {
    name?: string;
    arguments?: string;
  };
};

type CollectStreamCallbacks = {
  onContentChunk?: (chunk: string) => void | Promise<void>;
};

async function collectStream(
  stream: AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>,
  callbacks?: CollectStreamCallbacks,
): Promise<ChatCompletionMessage> {
  const toolCalls = new Map<number, ToolCallAccumulator>();
  let role: ChatCompletionMessage["role"] = "assistant";
  let content = "";

  for await (const chunk of stream) {
    for (const choice of chunk.choices) {
      const delta = choice.delta;
      if (delta.role) {
        role = delta.role as ChatCompletionMessage["role"];
      }
      if (delta.content) {
        const parts = Array.isArray(delta.content) ? delta.content : [delta.content];
        for (const part of parts) {
          const piece =
            typeof part === "string"
              ? part
              : "text" in part && typeof part.text === "string"
                ? part.text
                : "";
          if (piece) {
            content += piece;
            await callbacks?.onContentChunk?.(piece);
          }
        }
      }
      if (delta.tool_calls) {
        delta.tool_calls.forEach((toolCall, index) => {
          const existing = toolCalls.get(index) ?? { function: { arguments: "" } };
          if (toolCall.id) {
            existing.id = toolCall.id;
          }
          if (toolCall.type) {
            existing.type = toolCall.type;
          }
          if (toolCall.function?.name) {
            existing.function = existing.function ?? {};
            existing.function.name = toolCall.function.name;
          }
          if (toolCall.function?.arguments) {
            existing.function = existing.function ?? { arguments: "" };
            existing.function.arguments = (existing.function.arguments ?? "") + toolCall.function.arguments;
          }
          toolCalls.set(index, existing);
        });
      }
    }
  }

  const toolCallList: ChatCompletionMessageToolCall[] = Array.from(toolCalls.values()).map((call, index) => ({
    id: call.id ?? `call_${index}`,
    type: call.type ?? "function",
    function: {
      name: call.function?.name ?? "",
      arguments: call.function?.arguments ?? "",
    },
  }));

  return {
    role,
    content,
    refusal: null,
    tool_calls: toolCallList.length ? toolCallList : undefined,
  };
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
