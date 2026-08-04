import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import readline from "node:readline";
import { fileURLToPath } from "node:url";

const serverPath = fileURLToPath(new URL("../plugins/is-it-agent-ready/scripts/mcp-proxy.mjs", import.meta.url));

test("stdio MCP handshake and tools/list expose scan_site offline", async (t) => {
  const child = spawn(process.execPath, [serverPath], { stdio: ["pipe", "pipe", "pipe"] });
  t.after(() => child.kill());

  const lines = readline.createInterface({ input: child.stdout, crlfDelay: Infinity });
  const pending = [];
  lines.on("line", (line) => pending.shift()?.(JSON.parse(line)));

  function request(message) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${message.method}`)), 2_000);
      pending.push((payload) => {
        clearTimeout(timer);
        resolve(payload);
      });
      child.stdin.write(`${JSON.stringify(message)}\n`);
    });
  }

  const initialized = await request({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2025-11-25",
      capabilities: {},
      clientInfo: { name: "offline-test", version: "1.0.0" },
    },
  });
  assert.equal(initialized.result.protocolVersion, "2025-11-25");
  assert.equal(initialized.result.serverInfo.name, "is-it-agent-ready-safety-gateway");

  child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized", params: {} })}\n`);
  const listed = await request({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
  assert.deepEqual(listed.result.tools.map((tool) => tool.name), ["scan_site"]);
  assert.deepEqual(listed.result.tools[0].inputSchema.required, ["url"]);
  child.stdin.end();
});
