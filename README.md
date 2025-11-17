# ReAct Agent Template (TypeScript)

This template shows how to wire up a lightweight ReAct-style workflow on top of
the Chat Completions API (via the official SDK). It bundles:

- A reusable system prompt tuned for tool-first reasoning.
- Two common tools (`web_search` + `web_fetch`) implemented with DuckDuckGo HTML
  results plus HTTP fetch/cheerio parsing.
- Environment-based configuration so you only need to set your API-compatible
  key, base URL, and model.
- A minimal CLI (`pnpm start` or `npm run start`) that runs the loop end-to-end
  with optional `--debug` traces.

## Quick start

1. **Install dependencies**

   ```bash
   npm install
   # or pnpm install / yarn install / bun install
   ```

2. **Configure credentials**

   ```bash
   cp .env.example .env
   ```

   Fill in (the template prefers `OPENAI_*` / `MODEL_NAME`; `CLAUDE_*` works as fallback):

   - `OPENAI_API_KEY` (or `CLAUDE_API_KEY`) – API key from your provider
     (Anthropic-compatible gateways can still be used via fallback)
   - `OPENAI_BASE_URL` (or `CLAUDE_BASE_URL`) – e.g. `https://api.openai.com/v1`
     or your proxy (`https://ark-cn-beijing.bytedance.net/api/v3` works)
   - `MODEL_NAME` (or `CLAUDE_MODEL`) – e.g. `gpt-4o-mini`, `kimi-k2-0905`, etc.

   Once these three values are set you can run the agent immediately. Remaining
   knobs (temperature, max tokens, steps, sampling controls) default to safe
   values but can be overridden via the same env file.

3. **Run the agent**

   ```bash
   npm start -- "Summarize the latest on sodium-ion batteries and cite sources"
   ```

   Add `--debug` to see intermediate ReAct thoughts in the console.

### Using Bun

Bun works out of the box if you prefer its package manager/runtime:

1. **Install Bun (one-time)**

   ```bash
   curl -fsSL https://bun.sh/install | bash
   # or on macOS with Homebrew
   brew tap oven-sh/bun && brew install bun
   ```

2. **Install dependencies and run scripts**

   ```bash
   bun install
   bun run start -- "Summarize the latest on sodium-ion batteries and cite sources"
   bun run test
   bun run check
   bun run cases
   ```

   The commands mirror the `npm run` variants, so you can swap in Bun anywhere the docs mention `npm`.

## Project layout

```
src/
├── agent.ts        # ReAct loop wired to the chat SDK and tool registry
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
  guard rails. The prompt already guides the model to only emit a final answer once
  it no longer needs tools.
- For long-running workflows, consider capturing the `messages` array from
  `ReActAgent.run` and persisting it so you can resume future turns.

## Testing your setup

- Run `npm run check` to ensure TypeScript types pass.
- Run `npm test` to execute the lightweight config + tool unit tests.
- Run `npm run cases` to silently execute a couple of default end-to-end queries
  (no answer output; errors will surface in the console). This runner enforces at
  least 8 ReAct steps so multitool tasks have enough iterations.
- Run `npm start -- --debug "<query>"` to ensure the loop can reason about tool
  choices and cite sources.

## Notes

- The `web_search` tool scrapes DuckDuckGo's lightweight HTML endpoint. Swap it
  out for your preferred provider (Tavily, Serper, custom service, etc.) if you
  need higher reliability.
- The SDK calls respect a custom `OPENAI_BASE_URL`, so you can point the
  agent at api.openai.com, Ark, or any gateway that implements the Chat
  Completions interface with tool calling enabled.
