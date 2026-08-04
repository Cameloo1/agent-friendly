import test from "node:test";
import assert from "node:assert/strict";

import {
  ENABLED_CHECKS,
  PROFILES,
  SCAN_SITE_TOOL,
  validateScanArguments,
} from "../plugins/is-it-agent-ready/src/contract.mjs";

test("profile names match the live scanner contract", () => {
  assert.deepEqual(PROFILES, ["all", "content", "apiApp"]);
  assert.deepEqual(SCAN_SITE_TOOL.inputSchema.properties.profile.enum, PROFILES);
});

test("enabledChecks names match the 21-check live scanner contract", () => {
  assert.equal(ENABLED_CHECKS.length, 21);
  assert.deepEqual(SCAN_SITE_TOOL.inputSchema.properties.enabledChecks.items.enum, ENABLED_CHECKS);
  assert.deepEqual(ENABLED_CHECKS, [
    "robotsTxt", "sitemap", "linkHeaders", "dnsAid", "markdownNegotiation",
    "robotsTxtAiRules", "contentSignals", "webBotAuth", "apiCatalog",
    "oauthDiscovery", "oauthProtectedResource", "authMd", "mcpServerCard",
    "a2aAgentCard", "agentSkills", "webMcp", "x402", "mpp", "ucp", "acp", "ap2",
  ]);
});

test("accepts a profile or an explicit check subset", () => {
  assert.deepEqual(validateScanArguments({ url: "https://example.com", profile: "content" }), {
    url: "https://example.com",
    profile: "content",
  });
  assert.deepEqual(validateScanArguments({ url: "https://example.com", enabledChecks: ["robotsTxt"] }), {
    url: "https://example.com",
    enabledChecks: ["robotsTxt"],
  });
});

test("rejects unknown, duplicate, empty, and conflicting scan options", () => {
  assert.throws(() => validateScanArguments({ url: "https://example.com", profile: "api" }));
  assert.throws(() => validateScanArguments({ url: "https://example.com", enabledChecks: [] }));
  assert.throws(() => validateScanArguments({ url: "https://example.com", enabledChecks: ["oldName"] }));
  assert.throws(() => validateScanArguments({ url: "https://example.com", enabledChecks: ["sitemap", "sitemap"] }));
  assert.throws(() => validateScanArguments({ url: "https://example.com", profile: "all", enabledChecks: ["sitemap"] }));
  assert.throws(() => validateScanArguments({ url: "https://example.com", surprise: true }));
});
