#!/usr/bin/env node
/**
 * Smoke test — exercises the upstream MCP server directly using the same
 * fetch pattern src/index.js uses.  Does NOT spawn the bridge or test stdio
 * (that requires a real MCP client; npm pack + manual openclaw install is
 * the stdio integration test).
 *
 * Run: npm run smoke
 *
 * Prints pass/fail for:
 *   1. tools/list returns >= 8 tools
 *   2. askew_health returns a JSON body
 *   3. askew_yields returns a 402 envelope (proves paid path is reachable)
 */

const UPSTREAM =
  process.env.ASKEW_MCP_URL || "https://mcp.askew.network/mcp";
const REF = process.env.ASKEW_REF || "openclaw-smoke";

let id = 1;
async function call(method, params) {
  const url = new URL(UPSTREAM);
  url.searchParams.set("ref", REF);
  const resp = await fetch(url.toString(), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "accept": "application/json, text/event-stream",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: id++, method, params }),
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`HTTP ${resp.status}: ${text.slice(0, 200)}`);
  }
  const ct = resp.headers.get("content-type") || "";
  if (ct.includes("text/event-stream")) {
    const text = await resp.text();
    const data = text
      .split("\n")
      .reverse()
      .find((l) => l.startsWith("data: "));
    if (!data) throw new Error("empty SSE");
    return JSON.parse(data.slice(6).trim()).result;
  }
  const json = await resp.json();
  if (json.error) throw new Error(json.error.message);
  return json.result;
}

async function main() {
  let passed = 0;
  let failed = 0;
  const checks = [];

  try {
    const tools = await call("tools/list", {});
    const n = (tools.tools || []).length;
    if (n >= 8) {
      checks.push(`PASS  tools/list returned ${n} tools`);
      passed++;
    } else {
      checks.push(`FAIL  tools/list returned ${n} tools (expected >= 8)`);
      failed++;
    }
  } catch (e) {
    checks.push(`FAIL  tools/list: ${e.message}`);
    failed++;
  }

  try {
    const result = await call("tools/call", {
      name: "askew_health",
      arguments: {},
    });
    const text = (result.content?.[0]?.text || "").slice(0, 200);
    if (text.length > 0) {
      checks.push(`PASS  askew_health returned ${text.length} bytes`);
      passed++;
    } else {
      checks.push(`FAIL  askew_health returned empty content`);
      failed++;
    }
  } catch (e) {
    checks.push(`FAIL  askew_health: ${e.message}`);
    failed++;
  }

  try {
    const result = await call("tools/call", {
      name: "askew_yields",
      arguments: {},
    });
    const text = result.content?.[0]?.text || "";
    if (text.includes("x402Version") || text.includes("payment_required") || text.includes("payTo")) {
      checks.push(`PASS  askew_yields returned x402 envelope (paid path reachable)`);
      passed++;
    } else {
      checks.push(`FAIL  askew_yields did not return an x402 envelope. Body: ${text.slice(0, 200)}`);
      failed++;
    }
  } catch (e) {
    checks.push(`FAIL  askew_yields: ${e.message}`);
    failed++;
  }

  console.log("Askew OpenClaw plugin smoke test");
  console.log(`Upstream: ${UPSTREAM}  ref=${REF}`);
  console.log("");
  for (const c of checks) console.log("  " + c);
  console.log("");
  console.log(`${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
