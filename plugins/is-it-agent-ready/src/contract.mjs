export const PACKAGE_VERSION = "1.0.0";
export const UPSTREAM_URL = "https://isitagentready.com/mcp";
export const UPSTREAM_PROTOCOL_VERSION = "2025-06-18";

export const PROFILES = Object.freeze(["all", "content", "apiApp"]);

export const ENABLED_CHECKS = Object.freeze([
  "robotsTxt",
  "sitemap",
  "linkHeaders",
  "dnsAid",
  "markdownNegotiation",
  "robotsTxtAiRules",
  "contentSignals",
  "webBotAuth",
  "apiCatalog",
  "oauthDiscovery",
  "oauthProtectedResource",
  "authMd",
  "mcpServerCard",
  "a2aAgentCard",
  "agentSkills",
  "webMcp",
  "x402",
  "mpp",
  "ucp",
  "acp",
  "ap2",
]);

export const SCAN_SITE_TOOL = Object.freeze({
  name: "scan_site",
  description:
    "Scan one authorized public website with Cloudflare's Agent Readiness Scanner. Use this for agent-readiness audits, scores, evidence, focused re-tests, and before/after comparisons. The gateway rejects non-public and credential-bearing targets before contacting the scanner.",
  inputSchema: {
    type: "object",
    properties: {
      url: {
        type: "string",
        format: "uri",
        description: "Public http or https URL with no credentials, query string, or fragment.",
      },
      profile: …12454 tokens truncated…rows(() => validateScanArguments({ url: "https://example.com", enabledChecks: ["sitemap", "sitemap"] }));
  assert.throws(() => validateScanArguments({ url: "https://example.com", profile: "all", enabledChecks: ["sitemap"] }));
  assert.throws(() => validateScanArguments({ url: "https://example.com", surprise: true }));
});
