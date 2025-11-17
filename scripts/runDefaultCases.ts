import { ReActAgent } from "../src/agent";
import { buildAgentConfig, loadSettings } from "../src/config";
import { createWebFetchTool, createWebSearchTool } from "../src/tools";
import { createConsoleStreamObserver } from "../src/stream";
import { AnswerQualityEvaluator, type EvaluationResult } from "../src/evaluator";

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
  const agent = new ReActAgent(config, [createWebSearchTool(), createWebFetchTool()]);
  const evaluator = new AnswerQualityEvaluator(config);

  const evaluationRecords: {
    id: string;
    query: string;
    evaluation?: EvaluationResult;
    error?: string;
  }[] = [];

  for (const testCase of DEFAULT_CASES) {
    console.log(`\n=== ${testCase.id} ===`);
    console.log(`Query: ${testCase.query}`);
    try {
      const streamObserver = createConsoleStreamObserver();
      const { answer, transcript } = await agent.run(testCase.query, {
        debug: true,
        streamObserver,
      });
      if (answer.trim()) {
        console.log("\nAnswer:\n" + answer.trim());
      } else {
        console.log("\nAnswer: (empty)");
      }
      if (transcript?.length) {
        console.log("\n--- Transcript ---\n" + transcript.join("\n\n"));
      }
      try {
        const evaluation = await evaluator.evaluate({ query: testCase.query, answer });
        evaluationRecords.push({ id: testCase.id, query: testCase.query, evaluation });
        console.log(
          `\nEvaluation: score=${evaluation.score} verdict=${evaluation.verdict}\nReasoning: ${evaluation.reasoning}${
            evaluation.improvements ? `\nImprovements: ${evaluation.improvements}` : ""
          }`,
        );
      } catch (evalError) {
        const errorMessage = `Evaluation failed for ${testCase.id}: ${String(evalError)}`;
        console.error(errorMessage);
        evaluationRecords.push({ id: testCase.id, query: testCase.query, error: errorMessage });
      }
    } catch (error) {
      console.error(`Default case ${testCase.id} failed: ${String(error)}`);
      process.exitCode = 1;
    }
  }

  console.log("\n=== Evaluation Summary ===");
  if (!evaluationRecords.length) {
    console.log("No evaluations were recorded.");
    return;
  }

  for (const record of evaluationRecords) {
    if (record.evaluation) {
      console.log(
        `[${record.id}] score=${record.evaluation.score} verdict=${record.evaluation.verdict} – ${record.evaluation.reasoning}`,
      );
    } else if (record.error) {
      console.log(`[${record.id}] Evaluation error: ${record.error}`);
    }
  }

  const successful = evaluationRecords.filter((record) => Boolean(record.evaluation));
  if (successful.length) {
    const total = successful.reduce((sum, record) => sum + (record.evaluation?.score ?? 0), 0);
    const average = total / successful.length;
    const formattedAverage = Number.isInteger(average) ? average.toString() : average.toFixed(2);
    const best = successful.reduce((max, record) => {
      if (!max || (record.evaluation?.score ?? 0) > (max.evaluation?.score ?? 0)) {
        return record;
      }
      return max;
    });
    const worst = successful.reduce((min, record) => {
      if (!min || (record.evaluation?.score ?? 0) < (min.evaluation?.score ?? 0)) {
        return record;
      }
      return min;
    });
    console.log(
      `\nAverage score: ${formattedAverage} (based on ${successful.length} evaluations)\nBest: ${
        best?.id
      } -> ${best?.evaluation?.score}\nWorst: ${worst?.id} -> ${worst?.evaluation?.score}`,
    );
  } else {
    console.log("All evaluations failed; no aggregate stats.");
  }
}

runDefaultCases().catch((error) => {
  console.error(`Default cases runner crashed: ${String(error)}`);
  process.exit(1);
});
