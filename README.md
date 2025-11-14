# Claude ReAct Agent Template (TypeScript)

This template shows how to wire up a lightweight ReAct-style workflow on top of
the official Claude TypeScript SDK. It bundles:

- A reusable system prompt tuned for tool-first reasoning.
- Two common tools (`web_search` + `web_fetch`) implemented with DuckDuckGo HTML
  results plus HTTP fetch/cheerio parsing.
- Environment-based configuration so you only need to set your Claude key, base
  URL, and model.
- A minimal CLI (`pnpm start` or `npm run start`) that runs the loop end-to-end
  with optional `--debug` traces.

## Quick start

1. **Install dependencies**

   ```bash
   npm install
   # or pnpm install / yarn install
   ```

2. **Configure credentials**

   ```bash
   cp .env.example .env
   ```

   Fill in (either the `CLAUDE_*` variables or the provided `OPENAI_*`/`MODEL_NAME`
   aliases—both work):

   - `CLAUDE_API_KEY` (or `OPENAI_API_KEY`) – API key from console.anthropic.com or your proxy
   - `CLAUDE_BASE_URL` (or `OPENAI_BASE_URL`) – e.g. `https://api.anthropic.com` or your gateway
   - `CLAUDE_MODEL` (or `MODEL_NAME`) – e.g. `claude-3-5-sonnet-20240620`

   Once these three values are set you can run the agent immediately. Remaining
   knobs (temperature, max tokens, steps, sampling controls) default to safe
   values but can be overridden via the same env file.

3. **Run the agent**

   ```bash
   npm start -- "Summarize the latest on sodium-ion batteries and cite sources"
   ```

   Add `--debug` to see intermediate ReAct thoughts in the console.

## Project layout

```
src/
├── agent.ts        # ReAct loop wired to the Claude SDK and tool registry
├── cli.ts          # Command-line entry point
├── config.ts       # Env-backed settings + helper to build AgentConfig
├── prompts.ts      # System + user prompt templates
└── tools/
    ├── webFetch.ts  # Fetches and cleans a single URL
    └── webSearch.ts # DuckDuckGo search utility
```

## Extending the template

- Add more tools by creating a module under `src/tools/` that exposes
  `{ name, description, inputSchema, call }`. Export it via `src/tools/index.ts`
  and register it in `src/cli.ts`.
- Adjust the base prompt in `src/prompts.ts` to reflect your product voice or
  guard rails. The prompt already guides Claude to only emit a final answer once
  it no longer needs tools.
- For long-running workflows, consider capturing the `messages` array from
  `ReActAgent.run` and persisting it so you can resume future turns.

## Testing your setup

- Run `npm run check` to ensure TypeScript types pass.
- Run `npm test` to execute the lightweight config + tool unit tests.
- Run `npm start -- --debug "<query>"` to ensure the loop can reason about tool
  choices and cite sources.

## Notes

- The `web_search` tool scrapes DuckDuckGo's lightweight HTML endpoint. Swap it
  out for your preferred provider (Tavily, Serper, custom service, etc.) if you
  need higher reliability.
- The Claude SDK calls respect a custom `CLAUDE_BASE_URL`, so you can point the
  agent at Anthropic direct, Bedrock, or any gateway that implements the Claude
  Messages API.
