import { load } from "cheerio";
import { fetch as undiciFetch } from "undici";

import type { ToolDefinition } from "./types";

interface WebFetchInput extends Record<string, unknown> {
  url: string;
  max_chars?: number;
}

function resolveFetch(): typeof globalThis.fetch {
  if (typeof globalThis.fetch === "function") {
    return globalThis.fetch.bind(globalThis) as unknown as typeof globalThis.fetch;
  }
  return undiciFetch as unknown as typeof globalThis.fetch;
}

export function createWebFetchTool(): ToolDefinition<WebFetchInput> {
  return {
    name: "web_fetch",
    description:
      "Fetches a public web page by URL and returns the first few thousand characters of cleaned text for citation.",
    inputSchema: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "Absolute HTTP or HTTPS URL to fetch",
        },
        max_chars: {
          type: "integer",
          description: "Optional override for the amount of text to return",
          minimum: 200,
          maximum: 8000,
        },
      },
      required: ["url"],
    },
    async call(input) {
      const { url, max_chars } = input;
      if (!url) {
        throw new Error("url is required");
      }
      const limit = Math.max(200, Math.min(max_chars ?? 2000, 8000));
      try {
        const fetchFn = resolveFetch();
        const response = await fetchFn(url, { redirect: "follow" });
        if (!response.ok) {
          return JSON.stringify({
            error: `web_fetch failed with status ${response.status}`,
          });
        }
        const html = await response.text();
        const $ = load(html);
        const body = $("body").clone();
        body.find("script, style, noscript").remove();
        body.find("br").replaceWith("\n");
        body.find("p, div, li, h1, h2, h3, h4, h5, h6").append("\n");
        const text = body
          .text()
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, limit);
        return JSON.stringify(
          {
            url: response.url || url,
            status: response.status,
            excerpt: text,
          },
          null,
          2,
        );
      } catch (error) {
        return JSON.stringify({ error: `web_fetch failed: ${String(error)}` });
      }
    },
  };
}
