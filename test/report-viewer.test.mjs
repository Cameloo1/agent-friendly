import test from "node:test";
import assert from "node:assert/strict";

import {
  buildReportView,
  renderReportHtml,
} from "../plugins/is-it-agent-ready/src/report-viewer.mjs";

const SCANNER_TEXT = `# Agent Readiness: https://www.example.com

> Redirected from https://example.com

**Level 1/5 -- Basic Web Presence**

## Discoverability (2/4 passing)
- PASS robotsTxt: robots.txt exists with valid format
- PASS sitemap: sitemap.xml exists with valid structure
- FAIL linkHeaders -- Include Link response headers
  No Link headers found on homepage
  **Fix:** Add Link response headers.
  **Spec:** https://www.rfc-editor.org/rfc/rfc8288
- FAIL dnsAid -- Publish DNS-AID records
  DNS-AID entrypoint records not found

## Content Accessibility (0/1 passing)
- FAIL markdownNegotiation -- Support Markdown negotiation
  Site does not support Markdown for Agents

## Bot Access Control (1/2 passing)
- PASS robotsTxtAiRules: Wildcard rules apply to AI bots
- FAIL contentSignals -- Declare AI content usage preferences
  No Content Signals found in robots.txt
- OK webBotAuth: Web Bot Auth directory not found (excluded by scan configuration)

## API, Auth, MCP & A2A Discovery (0/0 passing)
- OK apiCatalog: API Catalog not found (excluded by scan configuration)
- OK oauthDiscovery: OAuth metadata not found (excluded by scan configuration)
- OK oauthProtectedResource: Protected resource metadata not found (excluded by scan configuration)
- OK authMd: auth.md not found (excluded by scan configuration)
- OK mcpServerCard: MCP Server Card not found (excluded by scan configuration)
- OK a2aAgentCard: A2A Agent Card not found (excluded by scan configuration)
- OK agentSkills: Agent Skills index not found (excluded by scan configuration)
- OK webMcp: Excluded by scan configuration

## Commerce (0/0 passing)
- OK x402: excluded by scan configuration
- OK mpp: excluded by scan configuration
- OK ucp: excluded by scan configuration
- OK acp: excluded by scan configuration
- OK ap2: excluded by scan configuration
`;

function record(overrides = {}) {
  return {
    id: "scan-1",
    savedAt: "2026-08-04T12:00:00.000Z",
    request: { url: "https://example.com/", profile: "content" },
    result: { content: [{ type: "text", text: SCANNER_TEXT }] },
    ...overrides,
  };
}

test("builds a transparent 100-point applicable-check pass rate", () => {
  const view = buildReportView(record());
  assert.equal(view.metrics.passing, 3);
  assert.equal(view.metrics.applicable, 7);
  assert.equal(view.metrics.excluded, 14);
  assert.equal(view.metrics.score, 43);
  assert.equal(view.metrics.countsMatch, true);
  assert.equal(view.categories[1].name, "Content accessibility");
  assert.equal(view.categories[3].name, "API, auth, MCP & A2A discovery");
  assert.equal(view.categories[0].checks[2].evidence, "No Link headers found on homepage");
  assert.equal(view.categories[2].checks[2].status, "excluded");
});

test("renders the requested static report layout without fix instructions or scripts", () => {
  const html = renderReportHtml(buildReportView(record()));
  assert.match(html, />43<span>\/100<\/span>/);
  assert.match(html, /3 of 7 applicable checks passing/);
  assert.match(html, /<code>linkHeaders<\/code>/);
  assert.match(html, /status-fail">FAIL/);
  assert.match(html, /<strong>Evidence:<\/strong> No Link headers found on homepage/);
  assert.match(html, /status-excluded">EXCLUDED/);
  assert.match(html, /https:\/\/example\.com.*→.*https:\/\/www\.example\.com/s);
  assert.doesNotMatch(html, /Level 1\/5/);
  assert.doesNotMatch(html, /Add Link response headers/);
  assert.doesNotMatch(html, /<script/i);
  assert.doesNotMatch(html, /\s(?:src|href)=/i);
  assert.doesNotMatch(html, /https?:\/\/[^<]*rfc8288/);
  assert.match(html, /Content-Security-Policy/);
  assert.match(html, /@media \(max-width: 420px\)/);
  assert.match(html, /grid-template-columns: minmax\(0, 1fr\) auto/);
  assert.match(html, /\.status-pass \{ color: var\(--pass\); \}/);
  assert.match(html, /\.status-fail, \.status-error \{ color: var\(--fail\); \}/);
});

test("omits the derived score for partial or inconsistent results", () => {
  const partial = record({
    result: {
      content: [{ type: "text", text: SCANNER_TEXT }],
      _meta: { partial: true, missingChecks: ["sitemap"] },
    },
  });
  const view = buildReportView(partial);
  assert.equal(view.metrics.score, null);
  assert.match(renderReportHtml(view), /Score unavailable/);

  const inconsistent = record({
    result: { content: [{ type: "text", text: SCANNER_TEXT.replace("(2/4 passing)", "(3/4 passing)") }] },
  });
  assert.equal(buildReportView(inconsistent).metrics.score, null);
});

test("escapes scanner-controlled text in the standalone viewer", () => {
  const malicious = record({
    request: { url: "https://example.com/", profile: "content" },
    result: {
      content: [{
        type: "text",
        text: "# Agent Readiness: https://example.com/<script>alert(1)</script>\n\n## Discoverability (0/1 passing)\n- FAIL robotsTxt -- Missing\n  <img src=x onerror=alert(1)>",
      }],
    },
  });
  const html = renderReportHtml(buildReportView(malicious));
  assert.doesNotMatch(html, /<script>alert/);
  assert.doesNotMatch(html, /<img src=/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
});
