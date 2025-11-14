import { load } from "cheerio";
import { fetch } from "undici";

import type { ToolDefinition } from "./types";

interface WebFetchInput {
  url: string;
  max_chars?: number;
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
        const response = await fetch(url, { redirect: "follow" });
        if (!response.ok) {
          return JSON.stringify({
            error: `web_fetch failed with status ${response.status}`,
          });
        }
        const html = await response.text();
        const $ = load(html);
        const text = $("body")
          .text()
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, limit);
        return JSON.stringify(
          {
            url: response.url ?? url,
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
