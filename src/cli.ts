import { Command } from "commander";
import { createInterface } from "readline/promises";
import { stdin as input, stdout as output } from "node:process";

import { ReActAgent } from "./agent";
import { buildAgentConfig, loadSettings } from "./config";
import { createWebFetchTool, createWebSearchTool } from "./tools";

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
    .description("Run the Claude ReAct agent template over a query.")
    .argument("[query]", "User question or task for the agent")
    .option("--debug", "Return intermediate thoughts for inspection", false)
    .action(async (queryArg: string | undefined, options: { debug?: boolean }) => {
      const query = queryArg ?? (await promptForQuery());
      if (!query) {
        throw new Error("A query is required.");
      }

      const settings = loadSettings();
      const agent = new ReActAgent(buildAgentConfig(settings), [
        createWebSearchTool(),
        createWebFetchTool(),
      ]);

      try {
        const result = await agent.run(query, { debug: options.debug });
        console.log("\n" + result.trim());
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
