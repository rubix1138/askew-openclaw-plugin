# @askew/openclaw-plugin

Self-sovereign x402 data feeds for [OpenClaw](https://openclaw.ai) — DeFi yields across 5 chains, native-vs-liquid staking routing, semantic search over 500+ agent-economy research findings, live security threat intel, and an aggregated single-call intel feed. Operated by the [Askew](https://git.ashe.website/Askew/Askew) agent fleet.

## Install

```sh
openclaw plugins install @askew/openclaw-plugin
```

That's it. The plugin is a thin Node bridge — no API key, no signup, no aggregator account. Operators with an existing OpenClaw wallet (e.g. via `@blockrun/clawrouter`) can call paid Askew tools immediately; payments settle directly to Askew's wallet on Base mainnet via [x402](https://x402.org).

## Why this exists — open vs closed x402 data

This plugin is the **open alternative to closed/curated x402 aggregator feeds**.

The closest comparable is [`@blockrun/mcp`](https://github.com/BlockRunAI/blockrun-mcp) (BlockRun's MCP server), which sells research, prediction-market, crypto, and X/Twitter data through a single BlockRun-curated gateway. It's a great product, but the data path is centralised: USDC flows to BlockRun's wallet, BlockRun decides what feeds are in-catalog, and projects like NoFx have surfaced concerns about gateway lock-in (see [NoFxAiOS/nofx#1464](https://github.com/NoFxAiOS/nofx/issues/1464)). Askew takes the opposite posture: every paid endpoint is a self-sovereign Askew agent, USDC settles directly to Askew's public wallet (`0xfe86200836683D291bD084C9008403763E15b185` — verifiable in our [A2A AgentCard](https://mcp.askew.network/.well-known/agent-card.json)), and there is no aggregator middleman in the data path. Same install ergonomics, no credit balance, no API key — just x402 between your wallet and ours. The two plugins are complementary; install both if you want both data catalogs.

## Tools

5 paid + 3 free, mirroring [`x402.askew.network/offers`](https://x402.askew.network/offers).

| Tool                  | Cost (USDC, Base) | Description                                                                                  |
| --------------------- | ----------------- | -------------------------------------------------------------------------------------------- |
| `askew_yields_preview`| Free              | Top yield pool per chain across Solana / Cosmos / Ethereum / Base / Arbitrum                 |
| `askew_offers`        | Free              | Curated catalog of paid endpoints with sample calls and buyer-intent context                 |
| `askew_health`        | Free              | Service status, wallet, pricing                                                              |
| `askew_yields`        | $0.002            | Top 5 yield pools per chain across 5 chains                                                  |
| `askew_staking_router`| $0.003            | SOL and ATOM native-vs-liquid staking routing                                                |
| `askew_research_query`| $0.003            | Semantic search over 500+ agent-economy research findings (ChromaDB, updated every 12h)      |
| `askew_intel_threats` | $0.002            | Guardian security alerts, deduped, last N hours                                              |
| `askew_intel_feed`    | $0.005            | Aggregated research + threats + staking snapshot in one call                                 |

See [`skills/askew/SKILL.md`](skills/askew/SKILL.md) for sample prompts and detailed argument schemas.

## How payment works

The plugin does **not** sign payments and does **not** read any environment variable. It is a transport bridge:

1. OpenClaw routes a skill invocation to this plugin's stdio MCP server.
2. The plugin forwards `tools/call` to `https://mcp.askew.network/mcp`, appending `?ref=openclaw` for attribution.
3. Paid tools return an x402 402-challenge envelope (price, payee, network, nonce).
4. The plugin returns the envelope verbatim to OpenClaw.
5. OpenClaw's runtime — or a sibling x402-aware plugin like `@blockrun/clawrouter` — signs and resubmits with `X-PAYMENT`. The signed transaction settles to Askew's wallet on Base.
6. Askew unwraps and returns data.

If you don't have an x402 client configured in OpenClaw yet, [ClawRouter's quickstart](https://github.com/BlockRunAI/ClawRouter) is the easiest path — it handles wallet generation, USDC funding, and pre-auth caching for any x402 endpoint, not just BlockRun's.

## Configuration

Optional. Defaults work out of the box.

| Key         | Env var            | Default                          | Notes                                                                                |
| ----------- | ------------------ | -------------------------------- | ------------------------------------------------------------------------------------ |
| `mcpUrl`    | `ASKEW_MCP_URL`    | `https://mcp.askew.network/mcp`  | Override if you run a private Askew mirror                                           |
| `ref`       | `ASKEW_REF`        | `openclaw`                       | Attribution channel — disaggregates traffic in Askew's dashboards                    |
| `timeoutMs` | `ASKEW_TIMEOUT_MS` | `30000`                          | Per-call HTTP timeout                                                                |

Set via OpenClaw's plugin config UI or as environment variables in the gateway process.

## Smoke test (before publish)

```sh
npm install
npm run smoke
```

This exercises the upstream MCP server using the same fetch pattern the bridge uses. It should print:

```
PASS  tools/list returned 8 tools
PASS  askew_health returned <N> bytes
PASS  askew_yields returned x402 envelope (paid path reachable)
0 failed
```

To inspect the published tarball before `npm publish`:

```sh
npm pack
tar tzf askew-openclaw-plugin-0.1.0.tgz
```

The tarball should contain `package.json`, `LICENSE`, `README.md`, `openclaw.plugin.json`, `openclaw.security.json`, `skills/askew/SKILL.md`, and `src/index.js` — and **nothing else** (no `.git`, no `node_modules`).

## Local install for testing

If you want to test without publishing to npm:

```sh
npm pack
openclaw plugins install ./askew-openclaw-plugin-0.1.0.tgz
```

## License

MIT — see [LICENSE](LICENSE). Source: <https://github.com/rubix1138/askew-openclaw-plugin>.
