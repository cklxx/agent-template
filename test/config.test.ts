import test from "node:test";
import assert from "node:assert/strict";

import { buildAgentConfig, loadSettings } from "../src/config";

test("loadSettings falls back to OPENAI_* env vars", () => {
  const originalEnv = { ...process.env } as NodeJS.ProcessEnv;

  try {
    delete process.env.CLAUDE_API_KEY;
    delete process.env.CLAUDE_MODEL;
    delete process.env.CLAUDE_BASE_URL;

    process.env.OPENAI_API_KEY = "test-key";
    process.env.OPENAI_BASE_URL = "https://example.test";
    process.env.MODEL_NAME = "kimi-k2-0905";
    process.env.CLAUDE_TEMPERATURE = "0.5";
    process.env.CLAUDE_MAX_TOKENS = "2048";
    process.env.AGENT_MAX_STEPS = "3";

    const settings = loadSettings();
    assert.equal(settings.claudeApiKey, "test-key");
    assert.equal(settings.claudeBaseUrl, "https://example.test");
    assert.equal(settings.claudeModel, "kimi-k2-0905");
    assert.equal(settings.temperature, 0.5);
    assert.equal(settings.maxTokens, 2048);
    assert.equal(settings.maxSteps, 3);

    const agentConfig = buildAgentConfig(settings);
    assert.equal(agentConfig.apiKey, "test-key");
    assert.equal(agentConfig.baseUrl, "https://example.test");
    assert.equal(agentConfig.model, "kimi-k2-0905");
  } finally {
    process.env = originalEnv;
  }
});
