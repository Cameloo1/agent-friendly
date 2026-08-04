export const PACKAGE_VERSION = "1.2.0";
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

const SCAN_INPUT_SCHEMA = Object.freeze({
  type: "object",
  properties: {
    url: {
      type: "string",
      format: "uri",
      description: "Public http or https URL with no credentials, query string, or fragment.",
    },
    profile: {
      type: "string",
      enum: PROFILES,
      description:
        'Use "content" for content-first sites, "apiApp" for apps/APIs without commerce, or "all" for commerce, uncertainty, or an explicit full scan.',
    },
    enabledChecks: {
      type: "array",
      items: { type: "string", enum: ENABLED_CHECKS },
      uniqueItems: true,
      minItems: 1,
      description: "Explicit checks for a focused re-test. Overrides profile.",
    },
  },
  required: ["url"],
  additionalProperties: false,
});

export const SCAN_SITE_TOOL = Object.freeze({
  name: "scan_site",
  description:
    "Scan one authorized public website with Cloudflare's Agent Readiness Scanner. Use this for agent-readiness audits, scores, evidence, focused re-tests, and before/after comparisons. The gateway rejects non-public and credential-bearing targets before contacting the scanner.",
  inputSchema: SCAN_INPUT_SCHEMA,
  annotations: {
    title: "Scan public website for agent readiness",
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
  },
});

export const SCAN_SITE_AND_SAVE_TOOL = Object.freeze({
  name: "scan_site_and_save",
  description:
    "Scan one authorized public website and atomically save the complete MCP result as JSON, readable Markdown, and a lightweight offline HTML viewer in the local application-data scan store. Use only when the user explicitly asks to save, retain, export, or view the scan.",
  inputSchema: SCAN_INPUT_SCHEMA,
  annotations: {
    title: "Scan public website and save the report",
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
  },
});

export function validateScanArguments(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("scan_site arguments must be an object.");
  }

  const allowed = new Set(["url", "profile", "enabledChecks"]);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new TypeError(`Unknown scan_site argument: ${key}.`);
  }

  if (typeof value.url !== "string" || value.url.trim() === "") {
    throw new TypeError("scan_site requires a non-empty url string.");
  }

  if (value.profile !== undefined && !PROFILES.includes(value.profile)) {
    throw new TypeError(`profile must be one of: ${PROFILES.join(", ")}.`);
  }

  if (value.enabledChecks !== undefined) {
    if (!Array.isArray(value.enabledChecks) || value.enabledChecks.length === 0) {
      throw new TypeError("enabledChecks must be a non-empty array when provided.");
    }
    const seen = new Set();
    for (const check of value.enabledChecks) {
      if (!ENABLED_CHECKS.includes(check)) {
        throw new TypeError(`Unknown enabledChecks value: ${String(check)}.`);
      }
      if (seen.has(check)) throw new TypeError(`Duplicate enabledChecks value: ${check}.`);
      seen.add(check);
    }
  }

  if (value.profile !== undefined && value.enabledChecks !== undefined) {
    throw new TypeError("Provide profile or enabledChecks, not both.");
  }

  return {
    url: value.url,
    ...(value.profile === undefined ? {} : { profile: value.profile }),
    ...(value.enabledChecks === undefined ? {} : { enabledChecks: [...value.enabledChecks] }),
  };
}
