import type { AgentStreamEvent, AgentStreamObserver } from "./agent";
import { stdout as outputStream } from "node:process";

function formatArguments(args: Record<string, unknown>): string {
  try {
    return JSON.stringify(args, null, 2);
  } catch {
    return String(args);
  }
}

function summarizeToolPreview(content: string, limit = 600): string {
  if (content.length <= limit) {
    return content;
  }
  return `${content.slice(0, limit)}\n... (${content.length - limit} more characters)`;
}

export interface ConsoleStreamOptions {
  writer?: NodeJS.WritableStream;
}

export function createConsoleStreamObserver(options: ConsoleStreamOptions = {}): AgentStreamObserver {
  const writer = options.writer ?? outputStream;
  let currentStep: number | null = null;

  return (event: AgentStreamEvent) => {
    switch (event.type) {
      case "step_started": {
        currentStep = event.step;
        writer.write(`\n=== Step ${event.step} ===\n`);
        break;
      }
      case "message_chunk": {
        writer.write(event.chunk);
        break;
      }
      case "message_completed": {
        if (event.toolCalls.length) {
          if (!event.content.endsWith("\n")) {
            writer.write("\n");
          }
        } else if (!event.trimmedContent.endsWith("\n")) {
          writer.write("\n");
        }
        break;
      }
      case "tool_call": {
        writer.write(`\n→ Calling ${event.call.name}`);
        if (currentStep !== null) {
          writer.write(` (step ${currentStep})`);
        }
        writer.write(` with:\n${formatArguments(event.call.arguments)}\n`);
        break;
      }
      case "tool_result": {
        const heading = event.isError ? "⚠️ Tool error" : "← Tool result";
        writer.write(`\n${heading} (${event.call.name}):\n${summarizeToolPreview(event.result)}\n`);
        break;
      }
      case "run_completed": {
        writer.write("\n\n✔️ Run complete.\n");
        break;
      }
    }
  };
}
