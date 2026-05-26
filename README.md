# Probeur

This repo is a bounty-oriented autonomous agent for the OOBE Protocol x Ace Data Cloud challenge.

Probeur discovers SAP agents/tools, validates candidates with Synapse Sentinel, consumes at least three Ace Data Cloud AI services through x402, records SAP escrow/payment evidence, and publishes a run report.

## Bounty Category

Primary target: **Ace Data Cloud Usage (x402 Facilitator)**.

Secondary coverage: SAP on-chain escrow path for general payment volume qualification.

## Workflow

```text
trigger
  -> SAP discovery
  -> candidate scoring
  -> Synapse Sentinel validation
  -> Ace service 1: manifest summary
  -> Ace service 2: capability/risk classification
  -> Ace service 3: final ranking/report
  -> SAP escrow proof
  -> run log + public report
```

## Quick Start

```bash
cp .env.example .env
npm run demo
```

`demo` runs without private keys or network funds. It creates:

- `data/runs.jsonl`
- `reports/latest.json`
- `reports/latest.md`
- `reports/latest.html`

## Live Mode Checklist

1. Create an Ace Data Cloud account at `https://platform.acedata.cloud`.
2. Get Synapse RPC access from `https://synapse.oobeprotocol.ai`.
3. Create/fund a Solana wallet for the agent and x402 payer.
4. Install dependencies:

```bash
npm install
```

5. Set `.env` and pick three Ace services available in your account:

```bash
AGENT_MODE=live
SAP_RPC_URL=https://us-1-mainnet.oobeprotocol.ai/rpc?api_key=...
SAP_AGENT_KEYPAIR_PATH=keys/agent.json
X402B_SOLANA_PAYER_PRIVATE_KEY=...
ACE_SERVICE_SUMMARY=ai-chat
ACE_SERVICE_RESEARCH=google-search
ACE_SERVICE_RANKING=github
```

6. Register and run:

```bash
npm run once
```

## Submission Proof

The generated report includes:

- agent identity
- SAP discovery count
- Sentinel validation evidence
- three Ace service calls
- x402 settlement evidence when returned by Ace
- SAP escrow evidence
- autonomy proof: trigger, selection, execution, payment, output

For the bounty video, show the three `ACE_SERVICE_*` values and the matching x402 payment evidence in `reports/latest.md`.

## Notes

Live mode is intentionally conservative. It avoids infinite loops, dedupes candidates, and logs every paid action so the final transaction pattern looks like real agent activity rather than artificial volume.
