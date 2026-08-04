import {
  PACKAGE_VERSION,
  UPSTREAM_PROTOCOL_VERSION,
  UPSTREAM_URL,
} from "./contract.mjs";

const DEFAULT_TIMEOUT_MS = 90_000;

export class UpstreamError extends Error {
  constructor(message, { kind = "upstream_error", status = null, retryAfter = null, deliveryUncertain = false } = {}) {
    super(message);
    this.name = "UpstreamError";
    this.kind = kind;
    this.status = status;
    this.retryAfter = retryAfter;
    this.deliveryUncertain = deliveryUncertain;
  }
}

function parseRetryAfter(value) {
  if (!value) return null;
  if (/^\d+$/.test(value.trim())) return `${value.trim()} seconds`;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toISOString();
}

export function parseMcpPayload(contentType, body, expectedId) {
  let messages;
  try {
    if (contentType.toLowerCase().includes("text/event-stream")) {
      messages = [];
      let data = [];
      for (const line of body.split(/\r?\n/)) {
        if (line === "") {
          if (data.length > 0) {
            messages.push(JSON.parse(data.join("\n")));
            data = [];
          }
          continue;
        }
        if (line.startsWith(":")) continue;
        if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
      }
      if (data.length > 0) messages.push(JSON.parse(data.join("\n")));
    } else {
      messages = [JSON.parse(body)];
    }
  } catch (error) {
    throw new UpstreamError(`Scanner returned malformed JSON: ${error.message}`, {
      kind: "malformed_response",
    });
  }

  const payload = messages.find((message) => message && message.id === expectedId);
  if (!payload || payload.jsonrpc !== "2.0") {
    throw new UpstreamError("Scanner response did not contain the expected JSON-RPC result.", {
      kind: "malformed_response",
    });
  }
  return payload;
}

function timeoutFromEnvironment() {
  const raw = process.env.IS_IT_AGENT_READY_TIMEOUT_MS;
  if (raw === undefined) return DEFAULT_TIMEOUT_MS;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1_000 || parsed > 600_000) return DEFAULT_TIMEOUT_MS;
  return parsed;
}

export class ScannerClient {
  constructor({
    endpoint = UPSTREAM_URL,
    fetchImpl = globalThis.fetch,
    timeoutMs = timeoutFromEnvironment(),
  } = {}) {
    if (typeof fetchImpl !== "function") throw new TypeError("A fetch implementation is required.");
    this.endpoint = endpoint;
    this.fetchImpl = fetchImpl;
    this.timeoutMs = timeoutMs;
    this.nextId = 1;
  }

  async post(method, params, { protocolVersion = UPSTREAM_PROTOCOL_VERSION, deliveryUncertain = false } = {}) {
    const id = this.nextId++;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let response;
    let body;

    try {
      response = await this.fetchImpl(this.endpoint, {
        method: "POST",
        headers: {
          Accept: "application/json, text/event-stream",
          "Content-Type": "application/json",
          "MCP-Protocol-Version": protocolVersion,
        },
        body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
        signal: controller.signal,
      });
      body = await response.text();
    } catch (error) {
      const timedOut = error?.name === "AbortError";
      throw new UpstreamError(
        timedOut ? "Scanner request timed out." : `Scanner connection failed: ${error.message}`,
        {
          kind: timedOut ? "timeout" : "connection_error",
          deliveryUncertain,
        },
      );
    } finally {
      clearTimeout(timer);
    }

    if (response.status === 429) {
      throw new UpstreamError("Scanner rate limit reached.", {
        kind: "rate_limit",
        status: response.status,
        retryAfter: parseRetryAfter(response.headers.get("retry-after")),
      });
    }
    if (response.status >= 500) {
      throw new UpstreamError(`Scanner returned HTTP ${response.status}.`, {
        kind: "server_error",
        status: response.status,
        deliveryUncertain,
      });
    }
    if (!response.ok) {
      throw new UpstreamError(`Scanner rejected the request with HTTP ${response.status}.`, {
        kind: "http_error",
        status: response.status,
      });
    }

    const payload = parseMcpPayload(response.headers.get("content-type") || "", body, id);
    if (payload.error) {
      throw new UpstreamError(
        `Scanner MCP error ${payload.error.code}: ${payload.error.message || "Unknown error"}`,
        { kind: "rpc_error" },
      );
    }
    if (!("result" in payload)) {
      throw new UpstreamError("Scanner response omitted result.", { kind: "malformed_response" });
    }
    return payload.result;
  }

  async notify(method, params, { protocolVersion = UPSTREAM_PROTOCOL_VERSION } = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let response;

    try {
      response = await this.fetchImpl(this.endpoint, {
        method: "POST",
        headers: {
          Accept: "application/json, text/event-stream",
          "Content-Type": "application/json",
          "MCP-Protocol-Version": protocolVersion,
        },
        body: JSON.stringify({ jsonrpc: "2.0", method, params }),
        signal: controller.signal,
      });
      await response.text();
    } catch (error) {
      const timedOut = error?.name === "AbortError";
      throw new UpstreamError(
        timedOut ? "Scanner notification timed out." : `Scanner notification failed: ${error.message}`,
        { kind: timedOut ? "timeout" : "connection_error" },
      );
    } finally {
      clearTimeout(timer);
    }

    if (response.status === 429) {
      throw new UpstreamError("Scanner rate limit reached during initialization.", {
        kind: "rate_limit",
        status: response.status,
        retryAfter: parseRetryAfter(response.headers.get("retry-after")),
      });
    }
    if (response.status >= 500) {
      throw new UpstreamError(`Scanner returned HTTP ${response.status} during initialization.`, {
        kind: "server_error",
        status: response.status,
      });
    }
    if (!response.ok) {
      throw new UpstreamError(`Scanner rejected initialization with HTTP ${response.status}.`, {
        kind: "http_error",
        status: response.status,
      });
    }
  }

  async retrySetup(operation) {
    try {
      return await operation();
    } catch (error) {
      if (!(error instanceof UpstreamError) || !["timeout", "connection_error", "server_error"].includes(error.kind)) {
        throw error;
      }
      return operation();
    }
  }

  async initialize() {
    const result = await this.retrySetup(() =>
      this.post("initialize", {
        protocolVersion: UPSTREAM_PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: "is-it-agent-ready-gateway", version: PACKAGE_VERSION },
      }),
    );

    if (!result || typeof result.protocolVersion !== "string") {
      throw new UpstreamError("Scanner initialize response omitted protocolVersion.", {
        kind: "malformed_response",
      });
    }
    await this.retrySetup(() =>
      this.notify("notifications/initialized", {}, { protocolVersion: result.protocolVersion }),
    );
    return result;
  }

  async listTools() {
    const initialized = await this.initialize();
    return this.retrySetup(() =>
      this.post("tools/list", {}, { protocolVersion: initialized.protocolVersion }),
    );
  }

  async scan(arguments_) {
    const initialized = await this.initialize();
    const call = () =>
      this.post(
        "tools/call",
        { name: "scan_site", arguments: arguments_ },
        { protocolVersion: initialized.protocolVersion, deliveryUncertain: true },
      );

    try {
      return await call();
    } catch (error) {
      if (error instanceof UpstreamError && error.kind === "server_error") return call();
      throw error;
    }
  }
}
