import {
  SCAN_SITE_AND_SAVE_TOOL,
  SCAN_SITE_TOOL,
  validateScanArguments,
} from "./contract.mjs";
import { ScanStore, ScanStoreError } from "./scan-store.mjs";
import { TargetPolicyError, validatePublicTarget } from "./target-policy.mjs";
import { ScannerClient, UpstreamError } from "./upstream-client.mjs";

export function toolError(message, meta = {}) {
  return {
    content: [{ type: "text", text: message }],
    isError: true,
    _meta: meta,
  };
}

export function validateToolResult(result) {
  if (!result || typeof result !== "object" || !Array.isArray(result.content) || result.content.length === 0) {
    throw new UpstreamError("Scanner returned a malformed tool result with no content.", {
      kind: "malformed_response",
    });
  }
  for (const block of result.content) {
    if (!block || typeof block !== "object" || typeof block.type !== "string") {
      throw new UpstreamError("Scanner returned a malformed content block.", {
        kind: "malformed_response",
      });
    }
  }
  return result;
}

function upstreamFailure(error) {
  const suffix = error.retryAfter ? ` Retry after ${error.retryAfter}.` : "";
  const uncertainty = error.deliveryUncertain
    ? " The scan may have reached the upstream service, so it was not automatically resubmitted."
    : "";
  return toolError(`Agent Readiness Scanner failed: ${error.message}${suffix}${uncertainty}`, {
    errorKind: error.kind,
    status: error.status,
    retryAfter: error.retryAfter,
    deliveryUncertain: error.deliveryUncertain,
  });
}

export class AgentReadinessGateway {
  constructor({ scanner = new ScannerClient(), lookup, scanStore } = {}) {
    this.scanner = scanner;
    this.lookup = lookup;
    this.scanStore = scanStore;
  }

  listTools() {
    return { tools: [SCAN_SITE_TOOL, SCAN_SITE_AND_SAVE_TOOL] };
  }

  async callTool(name, arguments_) {
    if (name !== "scan_site" && name !== "scan_site_and_save") {
      return toolError(`Unknown tool: ${name}.`, { errorKind: "unknown_tool" });
    }

    try {
      const validated = validateScanArguments(arguments_);
      const url = await validatePublicTarget(validated.url, { lookup: this.lookup });
      const result = await this.scanner.scan({ ...validated, url });
      const checked = validateToolResult(result);
      if (name !== "scan_site_and_save" || checked.isError) return checked;

      try {
        const activeStore = this.scanStore || new ScanStore();
        const savedScan = await activeStore.save({
          request: { ...validated, url },
          result: checked,
        });
        return {
          ...checked,
          content: [
            ...checked.content,
            {
              type: "text",
              text: [
                `Saved scan ${savedScan.id}.`,
                `JSON: ${savedScan.jsonPath}`,
                `Markdown: ${savedScan.markdownPath}`,
                `Viewer: ${savedScan.viewerPath}`,
              ].join("\n"),
            },
          ],
          _meta: { ...checked._meta, savedScan },
        };
      } catch (error) {
        if (!(error instanceof ScanStoreError)) throw error;
        return {
          ...checked,
          isError: true,
          content: [
            ...checked.content,
            { type: "text", text: `SAVE FAILED: ${error.message}` },
          ],
          _meta: {
            ...checked._meta,
            errorKind: error.code,
            scanCompleted: true,
          },
        };
      }
    } catch (error) {
      if (error instanceof TargetPolicyError || error instanceof TypeError) {
        return toolError(`Scan refused before any scanner call: ${error.message}`, {
          errorKind: error.code || "invalid_arguments",
        });
      }
      if (error instanceof UpstreamError) return upstreamFailure(error);
      return toolError(`Agent Readiness Scanner failed unexpectedly: ${error.message}`, {
        errorKind: "unexpected_error",
      });
    }
  }
}
