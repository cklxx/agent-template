import { ReActAgent } from "../src/agent";
import { buildAgentConfig, loadSettings } from "../src/config";
import { createWebFetchTool, createWebSearchTool } from "../src/tools";

const DEFAULT_CASES = [
  {
    id: "case-react-overview",
    query: "简要介绍 ReAct 智能体的关键阶段，并引用1-2个来源",
  },
  {
    id: "case-energy-news",
    query: "列出最近新能源或储能领域的两个最新动态并给出处",
  },
];

async function runDefaultCases() {
  const settings = loadSettings();
  const baseConfig = buildAgentConfig(settings);
  const config = {
    ...baseConfig,
    maxSteps: Math.max(baseConfig.maxSteps, 8),
  };
  const agent = new ReActAgent(config, [
    createWebSearchTool(),
    createWebFetchTool(),
  ]);

  for (const testCase of DEFAULT_CASES) {
    console.log(`\n=== ${testCase.id} ===`);
    console.log(`Query: ${testCase.query}`);
    try {
      const { answer, transcript } = await agent.run(testCase.query, { debug: true });
      if (transcript?.length) {
        console.log("Steps:\n" + transcript.join("\n\n"));
      }
      if (answer.trim()) {
        console.log("\nAnswer:\n" + answer.trim());
      } else {
        console.log("\nAnswer: (empty)");
      }
    } catch (error) {
      console.error(`Default case ${testCase.id} failed: ${String(error)}`);
      process.exitCode = 1;
    }
  }
}

runDefaultCases().catch((error) => {
  console.error(`Default cases runner crashed: ${String(error)}`);
  process.exit(1);
});
