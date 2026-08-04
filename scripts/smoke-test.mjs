#!/usr/bin/env node

import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { AgentReadinessGateway } from "../plugins/is-it-agent-ready/src/gateway.mjs";
import { ScannerClient } from "../plugins/is-it-agent-ready/src/upstream-client.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const server = path.join(root, "plugins", "is-it-agent-ready", "scripts", "mcp-proxy.mjs");

function runOfflineHandshake() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [server], {
      cwd: path.dirname(server),
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    const responses = [];
    let pending = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("Timed out waiting for the local MCP gateway."));
    }, 5_000);

    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.stdout.on("data", (chunk) => {
      pending += chunk;
      const lines = pending.split(/\r?\n/);
      pending = lines.pop() || "";
      for (const line of lines) {
        if (line.trim()) responses.push(JSON.parse(line));
      }
    });
    child.on("error", reject);
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) return reject(new Error(`Gateway exited ${code}: ${stderr}`));
      const initialized = responses.find((response) => response.id === 1)?.result;
      const tools = responses.find((response) => response.id === 2)?.result?.tools;
      if (initialized?.serverInfo?.name !== "is-it-agent-ready-safety-gateway") {
        return reject(new Error("MCP initialize did not identify the safety gateway."));
      }
      if (!Array.isArray(tools) || tools.length !== 1 || tools[0].name !== "scan_site") {
        return reject(new Error("MCP tools/list did not expose exactly scan_site."));
      }
      resolve(initialized);
    });

    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "release-smoke", version: "1" } } })}\n`);
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} })}\n`);
    child.stdin.end();
  });
}

async function main() {
  if (process.argv.includes("--upstream-contract")) {
    const listing = await new ScannerClient().listTools();
    const names = listing?.tools?.map((tool) => tool.name) || [];
    if (!names.includes("scan_site")) throw new Error("Live upstream tools/list does not expose scan_site.");
    process.stdout.write("PASS: live upstream tools/list exposes scan_site.\n");
    return;
  }

  const scanIndex = process.argv.indexOf("--scan");
  if (scanIndex !== -1) {
    const url = process.argv[scanIndex + 1];
    const profile = process.argv[scanIndex + 2] || "all";
    if (!url) throw new Error("--scan requires a public URL and optional profile.");
    const result = await new AgentReadinessGateway().callTool("scan_site", { url, profile });
    const output = result.content?.map((block) => block.text || "").join("\n") || "";
    process.stdout.write(`${output}\n`);
    if (result.isError) process.exitCode = 1;
    return;
  }

  const initialized = await runOfflineHandshake();
  process.stdout.write(`PASS: offline MCP handshake exposes scan_site through ${initialized.serverInfo.name} ${initialized.serverInfo.version}.\n`);
}

main().catch((error) => {
  process.stderr.write(`ERROR: ${error.message}\n`);
  process.exitCode = 1;
});
