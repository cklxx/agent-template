import OpenAI from "openai";
import type { AgentConfig } from "./config";

const DEFAULT_RUBRIC = `Score from 1 (very poor) to 5 (excellent) based on factual accuracy, completeness, and citation quality. Penalize missing sources when they are requested.`;
const SYSTEM_PROMPT = `You are an impartial grader. Carefully read the user query and the agent's answer, then respond ONLY with an XML snippet of the form:
<evaluation>
  <verdict>short verdict</verdict>
  <score>integer between 1 and 5</score>
  <reasoning>concise justification</reasoning>
  <improvements>optional suggestions</improvements>
</evaluation>
If you have no suggestions, include an empty <improvements /> tag. Do not include any characters before or after the XML.`;

export interface EvaluationRequest {
  query: string;
  answer: string;
  rubric?: string;
  references?: string;
}

export interface EvaluationResult {
  verdict: string;
  score: number;
  reasoning: string;
  improvements?: string;
  raw?: string;
}

export class AnswerQualityEvaluator {
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(private readonly config: AgentConfig, modelOverride?: string) {
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseUrl,
    });
    this.model = modelOverride ?? config.model;
  }

  async evaluate(request: EvaluationRequest): Promise<EvaluationResult> {
    const rubric = request.rubric ?? DEFAULT_RUBRIC;
    const messages = [
      {
        role: "system",
        content: SYSTEM_PROMPT,
      },
      {
        role: "user",
        content: [
          { type: "text", text: `# Evaluation rubric\n${rubric}` },
          { type: "text", text: `\n# User query\n${request.query}` },
          { type: "text", text: `\n# Agent answer\n${request.answer}` },
          request.references
            ? { type: "text", text: `\n# Additional context\n${request.references}` }
            : undefined,
        ].filter(Boolean) as OpenAI.Chat.Completions.ChatCompletionContentPart[],
      },
    ] satisfies OpenAI.Chat.Completions.ChatCompletionMessageParam[];

    const response = await this.client.chat.completions.create({
      model: this.model,
      temperature: 0,
      top_p: 1,
      max_tokens: 400,
      messages,
    });

    return this.parseEvaluationResponse(response);
  }

  private parseEvaluationResponse(
    response: OpenAI.Chat.Completions.ChatCompletion,
  ): EvaluationResult {
    const content = response.choices[0]?.message?.content ?? "{}";
    const text = renderEvaluationMessageContent(content);
    return parseEvaluationXml(text || "");
  }
}

type EvaluationMessageContent = OpenAI.Chat.Completions.ChatCompletionMessage["content"];
type EvaluationMessageContentPart = string | OpenAI.Chat.Completions.ChatCompletionContentPart;

function renderEvaluationMessageContent(content: EvaluationMessageContent): string {
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    const parts = content as EvaluationMessageContentPart[];
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

function parseEvaluationXml(xml: string): EvaluationResult {
  const text = xml.trim();
  const verdict = extractTag(text, "verdict") ?? "unknown";
  const rawScore = Number(extractTag(text, "score") ?? 0);
  const reasoning = extractTag(text, "reasoning") ?? "";
  const improvements = extractTag(text, "improvements");
  const normalizedScore = Number.isFinite(rawScore)
    ? Math.max(1, Math.min(5, Math.round(rawScore)))
    : 0;
  return {
    verdict,
    score: normalizedScore,
    reasoning,
    improvements: improvements && improvements.length ? improvements : undefined,
    raw: text,
  };
}

function extractTag(xml: string, tag: string): string | undefined {
  const regex = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "i");
  const match = xml.match(regex);
  if (match && typeof match[1] === "string") {
    return match[1].trim();
  }
  const selfClosing = new RegExp(`<${tag}(?:\\s[^>]*)?/>`, "i");
  return selfClosing.test(xml) ? "" : undefined;
}
