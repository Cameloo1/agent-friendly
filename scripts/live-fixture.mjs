#!/usr/bin/env node

import { ENABLED_CHECKS, PROFILES } from "../plugins/is-it-agent-ready/src/contract.mjs";
import { AgentReadinessGateway } from "../plugins/is-it-agent-ready/src/gateway.mjs";
import { ScannerClient, UpstreamError } from "../plugins/is-it-agent-ready/src/upstream-client.mjs";

const transientKinds = new Set(["timeout", "connection_error", "server_error", "rate_limit"]);

function warnAndPass(message) {
  process.stdout.write(`::warning title=Live scanner unavailable::${message}\n`);
  process.stdout.write(`NON-BLOCKING: ${message}\n`);
  process.exitCode = 0;
}

function fail(message) {
  process.stderr.write(`LIVE CONTRACT REGRESSION: ${message}\n`);
  process.exitCode = 1;
}

const client = new ScannerClient();

try {
  const listing = await client.listTools();
  const tool = listing?.tools?.find((candidate) => candidate.name === "scan_site");
  if (!tool) throw new Error("tools/list no longer exposes scan_site.");

  const profileEnum = tool.inputSchema?.properties?.profile?.enum;
  const checkEnum = tool.inputSchema?.properties?.enabledChecks?.items?.enum;
  if (JSON.stringify(profileEnum) !== JSON.stringify(PROFILES)) {
    throw new Error(`profile enum changed: ${JSON.stringify(profileEnum)}.`);
  }
  if (JSON.stringify(checkEnum) !== JSON.stringify(ENABLED_CHECKS)) {
    throw new Error(`enabledChecks enum changed: ${JSON.stringify(checkEnum)}.`);
  }

  const result = await new AgentReadinessGateway({ scanner: client }).callTool("scan_site", {
    url: "https://example.com/",
    profile: "content",
  });
  if (result.isError) {
    const kind = result._meta?.errorKind;
    if (transientKinds.has(kind)) {
      warnAndPass(result.content?.[0]?.text || `Transient live failure: ${kind}.`);
    } else {
      fail(result.content?.[0]?.text || "scan_site returned an error result.");
    }
  } else {
    const text = result.content?.find((block) => block.type === "text")?.text || "";
    if (!text.includes("Agent Readiness") || !text.includes("example.com") || !/Level\s+[0-5]\/5/.test(text)) {
      fail("Fixture result no longer contains the expected site and readiness level.");
    } else {
      const level = text.match(/Level\s+[0-5]\/5[^\n]*/)?.[0] || "level present";
      process.stdout.write(`PASS: live fixture scan completed (${level}).\n`);
    }
  }
} catch (error) {
  if (error instanceof UpstreamError && transientKinds.has(error.kind)) warnAndPass(error.message);
  else fail(error.message);
}
