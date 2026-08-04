import readline from "node:readline";
import { AgentReadinessGateway } from "./gateway.mjs";
import { PACKAGE_VERSION } from "./contract.mjs";

const SUPPORTED_PROTOCOLS = new Set([
  "2024-11-05",
  "2025-03-26",
  "2025-06-18",
  "2025-11-25",
]);

function rpcResult(id, result) {
  return { jsonrpc: "2.0", id, result };
}

function rpcError(id, code, message) {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

export async function dispatchMcpMessage(message, gateway = new AgentReadinessGateway()) {
  if (!message || typeof message !== "object" || message.jsonrpc !== "2.0" || typeof message.method !== "string") {
    return rpcError(message?.id ?? null, -32600, "Invalid Request");
  }
  if (!("id" in message)) return null;

  switch (message.method) {
    case "initialize": {
      const requested = message.params?.protocolVersion;
      const protocolVersion = SUPPORTED_PROTOCOLS.has(requested) ? requested : "2025-11-25";
      return rpcResult(message.id, {
        protocolVersion,
        capabilities: { tools: { listChanged: false } },
        serverInfo: {
          name: "is-it-agent-ready-safety-gateway",
          version: PACKAGE_VERSION,
        },
        instructions:
          "Use scan_site only for a user-authorized public website. The gateway rejects local, private, internal, and credential-bearing targets before contacting Cloudflare's scanner.",
      });
    }
    case "ping":
      return rpcResult(message.id, {});
    case "tools/list":
      return rpcResult(message.id, gateway.listTools());
    case "tools/call":
      return rpcResult(
        message.id,
        await gateway.callTool(message.params?.name, message.params?.arguments || {}),
      );
    default:
      return rpcError(message.id, -32601, `Method not found: ${message.method}`);
  }
}

export function runStdioServer({ input = process.stdin, output = process.stdout, gateway } = {}) {
  const activeGateway = gateway || new AgentReadinessGateway();
  const lines = readline.createInterface({ input, crlfDelay: Infinity, terminal: false });

  lines.on("line", async (line) => {
    if (line.trim() === "") return;
    let response;
    try {
      const message = JSON.parse(line);
      response = await dispatchMcpMessage(message, activeGateway);
    } catch (error) {
      response = rpcError(null, -32700, `Parse error: ${error.message}`);
    }
    if (response) output.write(`${JSON.stringify(response)}\n`);
  });

  return lines;
}
