---
name: is-it-agent-ready
description: Scan a public website for AI-agent readiness with Cloudflare's Agent Readiness Scanner, save, view, or explain its evidence, compare like-for-like scans, or guide verified fixes. Use when a user asks whether a site is agent-ready, requests an agent-readiness audit or score, wants a scan retained, exported, or opened as a report, wants named checks re-tested, or wants remediation based on scanner results.
---

# Is It Agent Ready

Safely scan and interpret one user-authorized public website with the bundled MCP tools. This is an unofficial integration; never imply that Cloudflare authored or endorsed it.

## Refuse unsafe targets

Before calling the tool, confirm the request names the exact public site to scan. Refuse:

- Schemes other than `http` or `https`.
- Usernames, passwords, query strings, or fragments in the URL.
- Localhost, loopback, link-local, private, shared, multicast, reserved, documentation, intranet, `.local`, `.internal`, `.localhost`, `.lan`, or cloud-metadata targets.
- Additional domains discovered during a scan unless the user separately requests them.

Use only the bundled `scan_site` or `scan_site_and_save` tool. Their gateway repeats these checks, resolves hostnames, and blocks any non-public address before contacting the remote scanner. Never bypass it by calling `https://isitagentready.com/mcp` directly.

## Select the scan

Choose the smallest applicable profile:

- `content`: blogs, documentation, portfolios, marketing sites, and other content-first sites.
- `apiApp`: SaaS products, applications, APIs, and developer platforms where commerce checks do not apply.
- `all`: commerce sites, uncertain site types, or an explicit request for every check.

Use `enabledChecks` instead of `profile` only for a named-check request or focused re-test. Valid names are:

`robotsTxt`, `sitemap`, `linkHeaders`, `dnsAid`, `markdownNegotiation`, `robotsTxtAiRules`, `contentSignals`, `webBotAuth`, `apiCatalog`, `oauthDiscovery`, `oauthProtectedResource`, `authMd`, `mcpServerCard`, `a2aAgentCard`, `agentSkills`, `webMcp`, `x402`, `mpp`, `ucp`, `acp`, `ap2`.

Do not send both `profile` and `enabledChecks`.

## Run once and report evidence

1. State the selected profile or checks and why they fit.
2. Call `scan_site` once. If the user explicitly asks to retain, export, save, or open the result as a report, call `scan_site_and_save` instead.
3. Preserve the returned level, pass/fail status, exclusions, evidence, timing, and specification links. Do not turn excluded or not-applicable checks into failures.
4. Never compute a replacement score or infer missing checks from a partial result.
5. Treat the score as directional evidence, not production certification.
6. Link the returned report URL. If the completed scan omits one, use `https://isitagentready.com/<hostname>` and label it as the public report route.
7. For a saved scan, report the returned scan ID plus the JSON, Markdown, and HTML viewer paths. Never claim a save succeeded without those returned paths.

Use this format:

```text
Overall: <returned score/level, or unavailable>
Profile: <profile or enabled checks>
High-value passes: <items>
Applicable failures: <ordered items with evidence>
Excluded, not applicable, or missing: <items and rationale>
Recommended next action: <one bounded action>
Report: <URL when a scan completed>
Saved files: <JSON, Markdown, and viewer paths only when requested and confirmed>
```

## Save only on request

`scan_site` never writes a local report. `scan_site_and_save` writes an atomic bundle outside the repository in the user's application-data scan store. The bundle contains `scan.json` with the complete MCP result, `report.md` with its readable text evidence, and `report.html` with a static offline viewer. Use the saving tool only after a direct request to retain, export, or view the scan; never save automatically during an ordinary audit.

The viewer's `/100` value is the labeled applicable-check pass rate: passing applicable checks divided by all applicable checks, rounded to the nearest whole number. It is not Cloudflare's 1–5 maturity level or a replacement scanner score. Exclude excluded and not-applicable checks from the calculation. Show no viewer score for partial or internally inconsistent results.

Prioritize crawl policy, sitemap, accessible content, and explicit access controls. Recommend API, OAuth, MCP, A2A, WebMCP, or commerce work only when the site actually exposes that capability. Never recommend fake endpoints or unsupported claims to increase a score. Treat draft and emerging standards as optional unless the product requires them.

## Handle failures without inventing results

- Invalid target: stop before any remote call and explain the boundary.
- Rate limit: report the returned retry guidance; do not loop.
- Setup timeout or transient connection failure: the gateway retries once.
- Scan-call timeout or broken delivery: report `delivery uncertain`; do not resubmit automatically.
- Partial result: label missing checks and omit any replacement score.
- Malformed response or missing tool: report the integration failure and no score.
- Storage failure after a completed scan: preserve and report the scan evidence, state that saving failed, and do not claim a saved artifact or retry the scan.

## Apply fixes only when requested

A scan or save request does not authorize site or repository fixes. If the user separately asks for fixes, inspect the current repository and deployment model, map each finding to its owning component, and implement only truthful applicable changes. Stop for separate approval before DNS, credentials, authentication, payments, deployment, production mutation, or any other externally visible change. Re-scan only after deployment is confirmed and only for the exact approved public URL.

For comparisons, keep the profile or `enabledChecks` identical and report changed checks, unchanged blockers, score delta, timestamps, and scanner errors.
