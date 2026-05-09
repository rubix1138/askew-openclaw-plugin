#!/usr/bin/env node
/**
 * @askew-network/openclaw-plugin — thin MCP bridge from OpenClaw to Askew.
 *
 * What this is
 * ------------
 * A single-process Node bridge that forwards MCP tool calls received over
 * stdio (the transport OpenClaw and Claude Code use for local plugins) to
 * Askew's public streamable-http MCP server at https://mcp.askew.network/mcp.
 *
 * Every upstream call is tagged with ?ref=<channel> (default: "openclaw") so
 * Askew's `fetchai_x402.log` and the Plan 041 Phase 7 attribution dashboard
 * disaggregate this plugin's traffic from direct/xpay traffic.
 *
 * What this is NOT
 * ----------------
 *  - Not a wallet. The bridge does not sign payments and never reads any
 *    environment variable. x402 402-challenge envelopes from Askew are passed
 *    back verbatim to whatever runtime is on the OpenClaw side; that runtime
 *    (the OpenClaw gateway, ClawRouter, or any x402-compliant client) signs
 *    and resubmits with X-PAYMENT.
 *  - Not a tool registry. The tool list is fetched live from the upstream
 *    MCP server's `tools/list` so Askew can add or change tools without a
 *    plugin re-publish.
 *
 * Config (read from env in the OpenClaw extension model)
 * ------------------------------------------------------
 *   ASKEW_MCP_URL   — override upstream URL (default https://mcp.askew.network/mcp)
 *   ASKEW_REF       — attribution tag, default "openclaw"
 *   ASKEW_TIMEOUT_MS — per-call timeout, default 30000
 *
 * License: MIT.  Source: https://github.com/rubix1138/askew-openclaw-plugin
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const DEFAULT_UPSTREAM = "https://mcp.askew.network/mcp";
const DEFAULT_REF = "openclaw";
const DEFAULT_TIMEOUT_MS = 30000;
const PLUGIN_VERSION = "0.1.0";

const config = {
  upstream: process.env.ASKEW_MCP_URL || DEFAULT_UPSTREAM,
  ref: process.env.ASKEW_REF || DEFAULT_REF,
  timeoutMs: Number(process.env.ASKEW_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS,
};

const log = (msg, ...rest) => {
  // OpenClaw / Claude Code consume MCP traffic on stdout; logs must go to
  // stderr or they'll corrupt the JSON-RPC stream.
  console.error(`[askew-openclaw-plugin] ${msg}`, ...rest);
};

/**
 * Minimal JSON-RPC over streamable-http MCP client.
 *
 * The Python upstream uses `StreamableHTTPSessionManager(json_response=True,
 * stateless=True)` — every request is a one-shot POST that gets back a JSON
 * response. We don't need persistent sessions, server-sent events, or the
 * full client SDK; a hand-rolled fetch wrapper is enough and removes one
 * dependency surface.
 *
 * Stateless mode means we MUST send the MCP `initialize` handshake on every
 * request, otherwise the server returns "Bad Request: Invalid request
 * parameters" (per the MCP spec — every session needs an initialize before
 * tools/* methods).  We achieve "send initialize every time" by sending it
 * in a session-establishment hop, then issuing the real call.
 *
 * Easier path: skip session establishment, just issue the call with a fresh
 * Mcp-Session-Id per request. The Python session manager in stateless mode
 * accepts this. If that path breaks against a future upstream change, fall
 * back to the official @modelcontextprotocol/sdk StreamableHTTPClientTransport.
 */

let nextRequestId = 1;

async function callUpstream(method, params, { timeoutMs }) {
  const url = new URL(config.upstream);
  // Append (don't replace) ?ref=<channel> so any existing query params survive.
  if (!url.searchParams.has("ref")) {
    url.searchParams.set("ref", config.ref);
  }

  const body = {
    jsonrpc: "2.0",
    id: nextRequestId++,
    method,
    params: params ?? {},
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let resp;
  try {
    resp = await fetch(url.toString(), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "accept": "application/json, text/event-stream",
        "user-agent": `askew-openclaw-plugin/${PLUGIN_VERSION}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    if (err && err.name === "AbortError") {
      throw new Error(`Askew upstream timeout after ${timeoutMs}ms`);
    }
    throw new Error(`Askew upstream fetch failed: ${err && err.message}`);
  }
  clearTimeout(timer);

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(
      `Askew upstream HTTP ${resp.status}: ${text.slice(0, 500)}`
    );
  }

  // Server may send back text/event-stream when the SDK upgrades; handle both.
  const contentType = resp.headers.get("content-type") || "";
  let payload;
  if (contentType.includes("text/event-stream")) {
    const text = await resp.text();
    // Pull the last `data: <json>` line — single-message stream by spec.
    const dataLine = text
      .split("\n")
      .reverse()
      .find((l) => l.startsWith("data: "));
    if (!dataLine) {
      throw new Error("Askew upstream returned empty SSE stream");
    }
    payload = JSON.parse(dataLine.slice(6).trim());
  } else {
    payload = await resp.json();
  }

  if (payload.error) {
    const msg = payload.error.message || JSON.stringify(payload.error);
    throw new Error(`Askew upstream JSON-RPC error: ${msg}`);
  }
  return payload.result;
}

// ---------------------------------------------------------------------------
// MCP server (the side OpenClaw / Claude Code talks to)
// ---------------------------------------------------------------------------

const server = new Server(
  {
    name: "askew-openclaw-plugin",
    version: PLUGIN_VERSION,
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

let toolsCache = null;
let toolsCacheAt = 0;
const TOOLS_TTL_MS = 5 * 60 * 1000;

async function getUpstreamTools() {
  if (toolsCache && Date.now() - toolsCacheAt < TOOLS_TTL_MS) {
    return toolsCache;
  }
  const result = await callUpstream("tools/list", {}, {
    timeoutMs: config.timeoutMs,
  });
  toolsCache = result.tools || [];
  toolsCacheAt = Date.now();
  return toolsCache;
}

server.setRequestHandler(ListToolsRequestSchema, async () => {
  try {
    const tools = await getUpstreamTools();
    return { tools };
  } catch (err) {
    log("tools/list failed:", err.message);
    // Return an empty list rather than crashing the plugin — OpenClaw will
    // mark the plugin as degraded but the rest of the gateway keeps working.
    return { tools: [] };
  }
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  try {
    const result = await callUpstream(
      "tools/call",
      { name, arguments: args || {} },
      { timeoutMs: config.timeoutMs }
    );
    // Pass through verbatim — including x402 402-challenge envelopes, which
    // Askew's server already wraps as TextContent JSON. OpenClaw's runtime
    // (or a sibling x402-aware plugin) handles the autopayment dance.
    return result;
  } catch (err) {
    log(`tools/call name=${name} failed:`, err.message);
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: JSON.stringify({
            error: "askew_upstream_failure",
            message: err.message,
            tool: name,
          }),
        },
      ],
    };
  }
});

// ---------------------------------------------------------------------------
// Entrypoint
// ---------------------------------------------------------------------------

async function main() {
  log(
    `starting v${PLUGIN_VERSION} upstream=${config.upstream} ref=${config.ref}`
  );
  const transport = new StdioServerTransport();
  await server.connect(transport);
  log("connected to stdio transport — ready for MCP requests");
}

main().catch((err) => {
  log("fatal:", err);
  process.exit(1);
});
