import { load } from "cheerio";
import { fetch as undiciFetch } from "undici";

import type { ToolDefinition } from "./types";

interface WebSearchInput extends Record<string, unknown> {
  query: string;
  max_results?: number;
}

function resolveFetch(): typeof globalThis.fetch {
  if (typeof globalThis.fetch === "function") {
    return globalThis.fetch.bind(globalThis) as unknown as typeof globalThis.fetch;
  }
  return undiciFetch as unknown as typeof globalThis.fetch;
}

function parseResults(html: string, limit: number) {
  const $ = load(html);
  const items: Array<{ title: string; url: string; snippet: string }> = [];
  $(".result__body").each((_idx, el) => {
    if (items.length >= limit) {
      return false;
    }
    const title = $(el).find(".result__a").text().trim();
    const url = $(el).find(".result__a").attr("href") || "";
    const snippet = $(el).find(".result__snippet").text().trim();
    if (title && url) {
      items.push({ title, url, snippet });
    }
    return undefined;
  });
  return items;
}

export function createWebSearchTool(): ToolDefinition<WebSearchInput> {
  return {
    name: "web_search",
    description:
      "Use this to discover recent information on the public internet. Provide focused queries; returns JSON with title, url, snippet.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Well-formed search query",
        },
        max_results: {
          type: "integer",
          description: "Maximum number of results (<=10)",
          minimum: 1,
          maximum: 10,
        },
      },
      required: ["query"],
    },
    async call(input) {
      const { query, max_results } = input;
      if (!query || !query.trim()) {
        throw new Error("query is required");
      }
      const limit = Math.max(1, Math.min(max_results ?? 6, 10));
      const endpoint = new URL("https://html.duckduckgo.com/html/");
      endpoint.searchParams.set("q", query);
      endpoint.searchParams.set("kl", "wt-wt");
      try {
        const fetchFn = resolveFetch();
        const response = await fetchFn(endpoint, {
          headers: {
            "User-Agent": "claude-react-agent-template/0.1",
          },
        });
        const html = await response.text();
        const results = parseResults(html, limit);
        return JSON.stringify(results, null, 2);
      } catch (error) {
        return JSON.stringify({ error: `web_search failed: ${String(error)}` });
      }
    },
  };
}
