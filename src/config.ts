import { config as loadEnv } from "dotenv";
import { z } from "zod";

loadEnv();

const SettingsSchema = z.object({
  claudeApiKey: z.string().min(1, "CLAUDE_API_KEY is required"),
  claudeModel: z.string().min(1).default("gpt-4o-mini"),
  claudeBaseUrl: z.string().min(1).default("https://api.openai.com/v1"),
  temperature: z.coerce.number().min(0).max(1).default(0.2),
  maxTokens: z.coerce.number().int().positive().default(1024),
  maxSteps: z.coerce.number().int().positive().max(10).default(5),
  topP: z.coerce.number().min(0).max(1).default(0.95),
  topK: z.coerce.number().int().positive().optional(),
});

export type Settings = z.infer<typeof SettingsSchema>;

export interface AgentConfig {
  apiKey: string;
  model: string;
  baseUrl: string;
  temperature: number;
  maxTokens: number;
  maxSteps: number;
  topP: number;
  topK?: number;
}

export function loadSettings(envPath?: string): Settings {
  if (envPath) {
    loadEnv({ path: envPath, override: false });
  }

  const apiKey = process.env.OPENAI_API_KEY || process.env.CLAUDE_API_KEY;
  const model =
    process.env.MODEL_NAME ||
    process.env.OPENAI_MODEL ||
    process.env.OPENAI_MODEL_NAME ||
    process.env.CLAUDE_MODEL;
  const baseUrl =
    process.env.OPENAI_BASE_URL || process.env.BASE_URL || process.env.CLAUDE_BASE_URL;

  return SettingsSchema.parse({
    claudeApiKey: apiKey,
    claudeModel: model,
    claudeBaseUrl: baseUrl,
    temperature: process.env.OPENAI_TEMPERATURE ?? process.env.CLAUDE_TEMPERATURE,
    maxTokens: process.env.OPENAI_MAX_TOKENS ?? process.env.CLAUDE_MAX_TOKENS,
    maxSteps: process.env.AGENT_MAX_STEPS,
    topP: process.env.OPENAI_TOP_P ?? process.env.CLAUDE_TOP_P,
    topK: process.env.OPENAI_TOP_K ?? process.env.CLAUDE_TOP_K,
  });
}

export function buildAgentConfig(settings: Settings): AgentConfig {
  return {
    apiKey: settings.claudeApiKey,
    model: settings.claudeModel,
    baseUrl: settings.claudeBaseUrl,
    temperature: settings.temperature,
    maxTokens: settings.maxTokens,
    maxSteps: settings.maxSteps,
    topP: settings.topP,
    topK: settings.topK,
  };
}
