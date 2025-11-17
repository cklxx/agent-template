import { Command } from "commander";
import { createInterface } from "readline/promises";
import { stdin as input, stdout as output } from "node:process";

import { ReActAgent } from "./agent";
import { buildAgentConfig, loadSettings } from "./config";
import { createWebFetchTool, createWebSearchTool } from "./tools";
import { createConsoleStreamObserver } from "./stream";
import { AnswerQualityEvaluator } from "./evaluator";

async function promptForQuery(): Promise<string> {
  const rl = createInterface({ input, output });
  try {
    const answer = await rl.question("Enter a query for the agent: ");
    return answer.trim();
  } finally {
    rl.close();
  }
}

async function main() {
  const program = new Command();
  program
    .name("react-agent")
    .description("Run the OpenAI ReAct agent template over a query.")
    .argument("[query]", "User question or task for the agent")
    .option("--debug", "Return intermediate thoughts for inspection", false)
    .option("--eval", "Run an AI quality evaluation after the answer", false)
    .action(async (queryArg: string | undefined, options: { debug?: boolean; eval?: boolean }) => {
      const query = queryArg ?? (await promptForQuery());
      if (!query) {
        throw new Error("A query is required.");
      }

      const settings = loadSettings();
      const agentConfig = buildAgentConfig(settings);
      const agent = new ReActAgent(agentConfig, [
        createWebSearchTool(),
        createWebFetchTool(),
      ]);
      const streamObserver = createConsoleStreamObserver({ writer: output });
      const evaluator = options.eval ? new AnswerQualityEvaluator(agentConfig) : null;

      try {
        const { answer, transcript } = await agent.run(query, {
          debug: options.debug,
          streamObserver,
        });
        if (options.debug && transcript?.length) {
          console.log("\n--- Transcript ---\n" + transcript.join("\n\n"));
        }
        console.log("\nAnswer:\n" + answer.trim());
        if (evaluator) {
          const evaluation = await evaluator.evaluate({ query, answer });
          console.log(
            `\nEvaluation: score=${evaluation.score} verdict=${evaluation.verdict}\nReasoning: ${evaluation.reasoning}${
              evaluation.improvements ? `\nImprovements: ${evaluation.improvements}` : ""
            }`,
          );
        }
      } catch (error) {
        console.error(`Agent run failed: ${String(error)}`);
        process.exitCode = 1;
      }
    });

  await program.parseAsync(process.argv);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
