import test from "node:test";
import assert from "node:assert/strict";

import { AgentReadinessGateway } from "../plugins/is-it-agent-ready/src/gateway.mjs";
import { ScanStoreError } from "../plugins/is-it-agent-ready/src/scan-store.mjs";
import { UpstreamError } from "../plugins/is-it-agent-ready/src/upstream-client.mjs";

const publicLookup = async () => [{ address: "93.184.216.34", family: 4 }];

test("unsafe targets are refused before the scanner is called", async () => {
  let calls = 0;
  const scanner = { scan: async () => { calls += 1; return { content: [{ type: "text", text: "never" }] }; } };
  const gateway = new AgentReadinessGateway({ scanner, lookup: publicLookup });
  const result = await gateway.callTool("scan_site", { url: "http://127.0.0.1/" });
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /refused before any scanner call/i);
  assert.equal(calls, 0);
});

test("preserves complete and partial scanner results without inventing a score", async () => {
  const upstream = {
    content: [{ type: "text", text: "Partial scan: sitemap unavailable; score omitted." }],
    _meta: { partial: true, missingChecks: ["sitemap"] },
  };
  const gateway = new AgentReadinessGateway({ scanner: { scan: async () => upstream }, lookup: publicLookup });
  const result = await gateway.callTool("scan_site", { url: "https://example.com/", profile: "content" });
  assert.deepEqual(result, upstream);
});

test("ordinary scans never persist results", async () => {
  let saves = 0;
  const upstream = { content: [{ type: "text", text: "Level 1/5" }] };
  const gateway = new AgentReadinessGateway({
    scanner: { scan: async () => upstream },
    lookup: publicLookup,
    scanStore: { save: async () => { saves += 1; } },
  });
  const result = await gateway.callTool("scan_site", { url: "https://example.com/", profile: "content" });
  assert.deepEqual(result, upstream);
  assert.equal(saves, 0);
});

test("explicit save calls persist the complete result and return durable paths", async () => {
  const upstream = { content: [{ type: "text", text: "Level 1/5" }], _meta: { partial: false } };
  let stored;
  const savedScan = {
    id: "scan-1",
    savedAt: "2026-08-04T12:00:00.000Z",
    directory: "/state/scan-1",
    jsonPath: "/state/scan-1/scan.json",
    markdownPath: "/state/scan-1/report.md",
    viewerPath: "/state/scan-1/report.html",
  };
  const gateway = new AgentReadinessGateway({
    scanner: { scan: async () => upstream },
    lookup: publicLookup,
    scanStore: { save: async (value) => { stored = value; return savedScan; } },
  });
  const result = await gateway.callTool("scan_site_and_save", {
    url: "https://example.com/",
    profile: "content",
  });
  assert.deepEqual(stored.request, { url: "https://example.com/", profile: "content" });
  assert.deepEqual(stored.result, upstream);
  assert.deepEqual(result._meta.savedScan, savedScan);
  assert.match(result.content.at(-1).text, /scan\.json/);
  assert.match(result.content.at(-1).text, /report\.html/);
  assert.equal(result.isError, undefined);
});

test("save failures preserve the completed scan and fail loudly", async () => {
  const upstream = { content: [{ type: "text", text: "Level 1/5" }] };
  const gateway = new AgentReadinessGateway({
    scanner: { scan: async () => upstream },
    lookup: publicLookup,
    scanStore: { save: async () => { throw new ScanStoreError("disk unavailable"); } },
  });
  const result = await gateway.callTool("scan_site_and_save", { url: "https://example.com/" });
  assert.equal(result.isError, true);
  assert.equal(result._meta.scanCompleted, true);
  assert.equal(result._meta.errorKind, "scan_store_error");
  assert.match(result.content[0].text, /Level 1\/5/);
  assert.match(result.content.at(-1).text, /SAVE FAILED.*disk unavailable/i);
});

test("handles timeout with delivery uncertainty and no fabricated score", async () => {
  const error = new UpstreamError("Scanner request timed out.", {
    kind: "timeout",
    deliveryUncertain: true,
  });
  const gateway = new AgentReadinessGateway({ scanner: { scan: async () => { throw error; } }, lookup: publicLookup });
  const result = await gateway.callTool("scan_site", { url: "https://example.com/" });
  assert.equal(result.isError, true);
  assert.equal(result._meta.deliveryUncertain, true);
  assert.match(result.content[0].text, /not automatically resubmitted/i);
  assert.doesNotMatch(result.content[0].text, /\b[0-5]\/5\b/);
});

test("handles rate limits and preserves retry guidance", async () => {
  const error = new UpstreamError("Scanner rate limit reached.", {
    kind: "rate_limit",
    status: 429,
    retryAfter: "30 seconds",
  });
  const gateway = new AgentReadinessGateway({ scanner: { scan: async () => { throw error; } }, lookup: publicLookup });
  const result = await gateway.callTool("scan_site", { url: "https://example.com/" });
  assert.equal(result.isError, true);
  assert.equal(result._meta.status, 429);
  assert.match(result.content[0].text, /Retry after 30 seconds/i);
});

test("rejects malformed scanner results gracefully", async () => {
  const gateway = new AgentReadinessGateway({ scanner: { scan: async () => ({ content: [] }) }, lookup: publicLookup });
  const result = await gateway.callTool("scan_site", { url: "https://example.com/" });
  assert.equal(result.isError, true);
  assert.equal(result._meta.errorKind, "malformed_response");
});
