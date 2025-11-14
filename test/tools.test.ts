import test from "node:test";
import assert from "node:assert/strict";
import { Response } from "undici";

import { createWebFetchTool, createWebSearchTool } from "../src/tools";

test("web_search parses DuckDuckGo-like HTML", async () => {
  const originalFetch = globalThis.fetch;
  const html = `
  <div class="result__body">
    <a class="result__a" href="https://example.com/post">Example title</a>
    <div class="result__snippet">Short snippet here.</div>
  </div>`;

  globalThis.fetch = (async () => new Response(html, { status: 200 })) as typeof fetch;

  try {
    const tool = createWebSearchTool();
    const result = await tool.call({ query: "test", max_results: 1 });
    const parsed = JSON.parse(result);
    assert.equal(parsed.length, 1);
    assert.equal(parsed[0].title, "Example title");
    assert.equal(parsed[0].url, "https://example.com/post");
    assert.equal(parsed[0].snippet, "Short snippet here.");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("web_fetch returns cleaned excerpt", async () => {
  const originalFetch = globalThis.fetch;
  const html = `<html><body><h1>Hello</h1><p>This is an article with detailed info.</p></body></html>`;

  globalThis.fetch = (async () => new Response(html, { status: 200 })) as typeof fetch;

  try {
    const tool = createWebFetchTool();
    const result = await tool.call({ url: "https://example.com/article", max_chars: 50 });
    const parsed = JSON.parse(result);
    assert.equal(parsed.status, 200);
    assert.equal(parsed.url, "https://example.com/article");
    assert.match(parsed.excerpt, /Hello This is an article/);
    assert.ok(parsed.excerpt.length <= 50);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
