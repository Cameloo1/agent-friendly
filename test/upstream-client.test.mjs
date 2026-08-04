import test from "node:test";
import assert from "node:assert/strict";

import { ScannerClient, UpstreamError, parseMcpPayload } from "../plugins/is-it-agent-ready/src/upstream-client.mjs";

function jsonResponse(payload, init = {}) {
  return new Response(JSON.stringify(payload), {
    status: init.status || 200,
    headers: { "Content-Type": "application/json", ...(init.headers || {}) },
  });
}

function sseResponse(payload) {
  return new Response(`event: message\ndata: ${JSON.stringify(payload)}\n\n`, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}

test("parses JSON and SSE MCP responses", () => {
  const payload = { jsonrpc: "2.0", id: 7, result: { ok: true } };
  assert.deepEqual(parseMcpPayload("application/json", JSON.stringify(payload), 7), payload);
  assert.deepEqual(parseMcpPayload("text/event-stream", `: keepalive\ndata: ${JSON.stringify(payload)}\n\n`, 7), payload);
});

test("rejects malformed and mismatched MCP responses", () => {
  assert.throws(() => parseMcpPayload("application/json", "not json", 1), UpstreamError);
  assert.throws(
    () => parseMcpPayload("application/json", JSON.stringify({ jsonrpc: "2.0", id: 2, result: {} }), 1),
    UpstreamError,
  );
});

test("rate limits return retry guidance without retry loops", async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return new Response("rate limited", { status: 429, headers: { "Retry-After": "30" } });
  };
  const client = new ScannerClient({ fetchImpl, timeoutMs: 100 });
  await assert.rejects(
    () => client.initialize(),
    (error) => error instanceof UpstreamError && error.kind === "rate_limit" && error.retryAfter === "30 seconds",
  );
  assert.equal(calls, 1);
});

test("setup timeout retries once and then stops", async () => {
  let calls = 0;
  const fetchImpl = async (_url, { signal }) => {
    calls += 1;
    return new Promise((resolve, reject) => {
      signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })), {
        once: true,
      });
    });
  };
  const client = new ScannerClient({ fetchImpl, timeoutMs: 10 });
  await assert.rejects(() => client.initialize(), (error) => error.kind === "timeout");
  assert.equal(calls, 2);
});

test("timeout remains active while the response body is read", async () => {
  let calls = 0;
  const fetchImpl = async (_url, { signal }) => {
    calls += 1;
    return {
      status: 200,
      ok: true,
      headers: new Headers({ "Content-Type": "application/json" }),
      text: () => new Promise((resolve, reject) => {
        signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })), {
          once: true,
        });
      }),
    };
  };
  const client = new ScannerClient({ fetchImpl, timeoutMs: 10 });
  await assert.rejects(() => client.initialize(), (error) => error.kind === "timeout");
  assert.equal(calls, 2);
});

test("scan-call timeout is delivery-uncertain and is not retried", async () => {
  let calls = 0;
  const fetchImpl = async (_url, { body, signal }) => {
    calls += 1;
    const request = JSON.parse(body);
    if (request.method === "initialize") {
      return sseResponse({
        jsonrpc: "2.0",
        id: request.id,
        result: { protocolVersion: "2025-06-18", serverInfo: { name: "Agent Readiness Scanner" }, capabilities: {} },
      });
    }
    if (request.method === "notifications/initialized") return new Response(null, { status: 202 });
    return new Promise((resolve, reject) => {
      signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })), {
        once: true,
      });
    });
  };
  const client = new ScannerClient({ fetchImpl, timeoutMs: 10 });
  await assert.rejects(
    () => client.scan({ url: "https://example.com/" }),
    (error) => error.kind === "timeout" && error.deliveryUncertain === true,
  );
  assert.equal(calls, 3);
});

test("malformed successful responses fail as contract errors", async () => {
  const fetchImpl = async () => new Response("{broken", {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
  const client = new ScannerClient({ fetchImpl, timeoutMs: 100 });
  await assert.rejects(
    () => client.initialize(),
    (error) => error.kind === "malformed_response",
  );
});

test("scanner client sends no authorization or API-key header", async () => {
  let observedHeaders;
  const fetchImpl = async (_url, options) => {
    observedHeaders = options.headers;
    const request = JSON.parse(options.body);
    if (request.method === "notifications/initialized") return new Response(null, { status: 202 });
    return jsonResponse({
      jsonrpc: "2.0",
      id: request.id,
      result: { protocolVersion: "2025-06-18", serverInfo: { name: "Agent Readiness Scanner" }, capabilities: {} },
    });
  };
  const client = new ScannerClient({ fetchImpl, timeoutMs: 100 });
  await client.initialize();
  assert.equal(observedHeaders.Authorization, undefined);
  assert.equal(observedHeaders["X-API-Key"], undefined);
});

test("initialize completes the MCP lifecycle with an initialized notification", async () => {
  const methods = [];
  const fetchImpl = async (_url, options) => {
    const request = JSON.parse(options.body);
    methods.push(request.method);
    if (request.method === "notifications/initialized") {
      assert.equal("id" in request, false);
      return new Response(null, { status: 202 });
    }
    return jsonResponse({
      jsonrpc: "2.0",
      id: request.id,
      result: { protocolVersion: "2025-06-18", serverInfo: { name: "Agent Readiness Scanner" }, capabilities: {} },
    });
  };
  await new ScannerClient({ fetchImpl, timeoutMs: 100 }).initialize();
  assert.deepEqual(methods, ["initialize", "notifications/initialized"]);
});
