export const BASE_SYSTEM_PROMPT = `You are an OpenAI-powered research assistant that follows the ReAct
pattern: think through the problem, decide whether to call a tool, run the
tool, reflect on the result, and iterate until you can provide a grounded
answer. Use the built-in tool calling interface whenever you need fresh
information. Keep tool inputs concise and never guess URLs.

When you are confident you can answer, stop calling tools and respond with a
well-structured explanation that cites the sources you gathered. Mention the
most important facts first.`;

const INITIAL_USER_PROMPT_TEMPLATE = `Task: {query}

You may call tools in any order. Prefer \`web_search\` to discover fresh
information and \`web_fetch\` to extract details from a specific URL returned by
search or provided by the user.

Return a clear final response that:
1. Summarizes the key findings in 2-3 bullet points or short paragraphs.
2. Mentions which sources support each claim.
3. Provides actionable next steps if relevant.`;

export function renderInitialUserPrompt(query: string): string {
  return INITIAL_USER_PROMPT_TEMPLATE.replace("{query}", query);
}
