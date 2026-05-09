---
name: askew
description: Use for self-sovereign x402 data feeds — DeFi yields across Solana/Cosmos/Ethereum/Base/Arbitrum, native-vs-liquid staking routing for SOL and ATOM, semantic search over 500+ agent-economy research findings, live security threat intel from the Askew Guardian monitor, and a single-call aggregated intel feed. Open alternative to closed aggregators; payments go directly to Askew's wallet via x402, no middleman.
triggers:
  - "askew"
  - "askew yields"
  - "askew staking"
  - "askew research"
  - "askew intel"
  - "askew threats"
  - "askew offers"
  - "x402 yields"
  - "x402 staking router"
  - "agent economy research"
  - "guardian threat intel"
  - "self-sovereign x402"
  - "open x402 data feed"
  - "defi yield comparison cross-chain"
  - "native vs liquid staking sol"
  - "native vs liquid staking atom"
homepage: https://x402.askew.network/offers
repository: https://github.com/rubix1138/askew-openclaw-plugin
license: MIT
metadata:
  openclaw:
    emoji: 🦴
    install:
      - id: node
        kind: node
        package: "@askew-network/openclaw-plugin"
        bins: ["askew-openclaw-bridge"]
        label: "Install Askew (npm)"
---

# Askew — Self-Sovereign x402 Data Feeds

Live data from the [Askew](https://git.ashe.website/Askew/Askew) agent ecosystem, served via [x402](https://x402.org) micropayments on Base mainnet. The plugin is a thin Node bridge that forwards OpenClaw skill invocations to `https://mcp.askew.network/mcp` — Askew's public MCP server. Payments go directly from your wallet to Askew's wallet (`0xfe86200836683D291bD084C9008403763E15b185`), settled on Base. No aggregator, no credit balance, no API key.

## Quick decision table

| User wants...                                              | Tool                  | Cost            |
| ---------------------------------------------------------- | --------------------- | --------------- |
| Free top-yield-per-chain preview                           | `askew_yields_preview`| Free            |
| Catalog of all paid offers                                 | `askew_offers`        | Free            |
| Service status / wallet / pricing                          | `askew_health`        | Free            |
| Top 5 yield pools per chain across 5 chains                | `askew_yields`        | $0.002 USDC     |
| Native vs liquid staking routing for SOL and ATOM          | `askew_staking_router`| $0.003 USDC     |
| Semantic search over 500+ agent-economy research findings  | `askew_research_query`| $0.003 USDC     |
| Guardian security alerts in last N hours                   | `askew_intel_threats` | $0.002 USDC     |
| Aggregated intel feed (research + threats + staking)       | `askew_intel_feed`    | $0.005 USDC     |

All paid endpoints return an x402 402-challenge envelope on first call. Whatever x402-aware runtime invoked this plugin handles the autopayment dance — most commonly OpenClaw's gateway or a sibling plugin like `@blockrun/clawrouter` (any x402-compliant payer works).

## Free tools

### `askew_yields_preview`
Top DeFi yield pool per chain across Solana, Cosmos, Ethereum, Base, and Arbitrum. Single best APY option per chain. Use before buying `askew_yields` for a full comparison.

```json
{ "name": "askew_yields_preview", "arguments": {} }
```

### `askew_offers`
Curated catalog of all available paid Askew endpoints with pricing, sample calls, and buyer-intent context. Best starting point for agents exploring what Askew sells.

```json
{ "name": "askew_offers", "arguments": {} }
```

### `askew_health`
Service status — wallet address, network, current pricing, and payment summary.

```json
{ "name": "askew_health", "arguments": {} }
```

## Paid tools

### `askew_yields` — $0.002 USDC
Live DeFi yield comparison across 5 chains in one call. Returns top 5 pools per chain (Solana, Cosmos, Ethereum, Base, Arbitrum) with APY, TVL, and project name. Data from DefiLlama, cached up to 6h. Best for: quick yield scanning before moving capital.

```json
{ "name": "askew_yields", "arguments": {} }
```

### `askew_staking_router` — $0.003 USDC
Staking yield router for SOL and ATOM. Compares native PoS staking vs liquid staking alternatives and returns a routing recommendation per chain. Data from DefiLlama + Askew's staking portfolio, cached up to 6h. Best for: deciding native vs liquid staking.

```json
{ "name": "askew_staking_router", "arguments": {} }
```

### `askew_research_query` — $0.003 USDC
Semantic search over 500+ Askew agent-economy research findings, operational insights, and experiments. Powered by ChromaDB, updated every 12h by the Research agent. Best for: finding what Askew has already learned about agent monetization, x402 buyer-discovery, or DeFi strategy.

```json
{
  "name": "askew_research_query",
  "arguments": {
    "q": "x402 buyer discovery",
    "collection": "research_findings",
    "limit": 5
  }
}
```

`collection` is one of `research_findings | agent_insights | experiments`. `limit` is 1-20 (default 5).

### `askew_intel_threats` — $0.002 USDC
Live threat intelligence from the Askew Guardian security monitor. WARNING/ERROR/CRITICAL log entries from the last N hours, deduplicated by category. Best for: security triage before agent operations.

```json
{
  "name": "askew_intel_threats",
  "arguments": { "hours": 24 }
}
```

`hours` is 1-168 (default 24).

### `askew_intel_feed` — $0.005 USDC
Aggregated feed combining recent research findings, active security threats, and a live staking APY snapshot in a single call. Best for: broad situational awareness — replaces three separate calls.

```json
{ "name": "askew_intel_feed", "arguments": {} }
```

## How payment works

This plugin does NOT hold a wallet key and does NOT sign payments. It is a transport bridge:

1. OpenClaw routes a skill invocation to this plugin.
2. The plugin forwards it to `mcp.askew.network/mcp` via MCP `tools/call`, appending `?ref=openclaw` for attribution.
3. For paid tools, Askew returns an x402 402-challenge envelope (price, payee wallet, network, nonce).
4. The plugin returns that envelope verbatim to OpenClaw's runtime.
5. OpenClaw's gateway (or a configured x402 client) signs and resubmits with `X-PAYMENT`. The signed transaction settles directly to Askew's wallet on Base.
6. Askew's MCP server unwraps the data and returns it.

That means **your USDC goes directly to Askew's wallet, with no aggregator on the payment path.** You can verify the payee at any time: `https://mcp.askew.network/.well-known/agent-card.json` (look at `payments[].payee`).

## See also

- `@blockrun/clawrouter` — sibling OpenClaw plugin that handles x402 payment signing for arbitrary x402 endpoints. If installed, it will autopay Askew's challenges transparently.
- [`mcp.askew.network/.well-known/agent-card.json`](https://mcp.askew.network/.well-known/agent-card.json) — A2A AgentCard with the same skill catalog, for non-OpenClaw discovery.
- [Askew's `awesome-x402` listing](https://github.com/xpaysh/awesome-x402) — alternative direct entry point.
