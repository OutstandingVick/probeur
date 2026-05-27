import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { config, requireLiveConfig } from "../config.js";
import { stableId } from "../util.js";

const require = createRequire(import.meta.url);

const DEMO_AGENTS = [
  {
    wallet: "7kAudit1111111111111111111111111111111111111",
    name: "MarketSense Agent",
    protocols: ["sap", "market-data"],
    reputation: 91,
    tools: [
      { name: "price-snapshot", category: "market-data", priceLamports: 1_000_000 },
      { name: "volatility-summary", category: "analytics", priceLamports: 1_500_000 }
    ]
  },
  {
    wallet: "8kDoc22222222222222222222222222222222222222",
    name: "DocParse Agent",
    protocols: ["sap", "documents"],
    reputation: 87,
    tools: [{ name: "extract-doc-facts", category: "documents", priceLamports: 2_000_000 }]
  },
  {
    wallet: "9kRisk33333333333333333333333333333333333333",
    name: "RiskLens Agent",
    protocols: ["sap", "security"],
    reputation: 94,
    tools: [{ name: "endpoint-risk-score", category: "security", priceLamports: 1_750_000 }]
  }
];

export class SapAdapter {
  constructor({ mode = config.mode } = {}) {
    this.mode = mode;
    this.client = null;
    this.wallet = null;
  }

  async init() {
    if (this.mode !== "live") return;
    requireLiveConfig();

    const sap = require("@oobe-protocol-labs/synapse-sap-sdk");
    const web3 = require("@solana/web3.js");

    const keypairBytes = JSON.parse(readFileSync(config.agent.keypairPath, "utf8"));
    const keypair = web3.Keypair.fromSecretKey(Uint8Array.from(keypairBytes));
    const wallet = {
      publicKey: keypair.publicKey,
      async signTransaction(tx) {
        tx.sign([keypair]);
        return tx;
      },
      async signAllTransactions(txs) {
        txs.forEach((tx) => tx.sign([keypair]));
        return txs;
      }
    };

    this.sdk = sap;
    this.web3 = web3;
    this.keypair = keypair;
    this.client = sap.createSapClient(config.sap.rpcUrl, wallet);
    this.wallet = keypair.publicKey.toBase58();
  }

  async registerAgent() {
    const manifest = {
      name: config.agent.name,
      description: config.agent.description,
      capabilities: [
        {
          id: "sap:autonomous-tool-audit",
          protocolId: "sap",
          version: "1.0.0",
          description: "Discovers SAP tools and scores them using Sentinel and Ace Data Cloud"
        },
        {
          id: "acedata:x402-ai-evaluation",
          protocolId: "x402",
          version: "1.0.0",
          description: "Consumes Ace Data Cloud services through x402 facilitator"
        }
      ],
      pricing: [],
      protocols: ["sap", "x402", "acedata"]
    };

    if (this.mode !== "live") {
      return {
        mode: "dry-run",
        wallet: "DryRunAgent111111111111111111111111111111111",
        tx: `dry-register-${stableId(manifest)}`,
        manifest
      };
    }

    const wallet = this.keypair.publicKey;
    const [agent] = this.sdk.Pdas.getAgentPDA(wallet);
    const [agentStats] = this.sdk.Pdas.getAgentStatsPDA(wallet);
    const [globalRegistry] = this.sdk.Pdas.getGlobalPDA();
    const existing = await this.client.fetchAccount("agent", agent);

    if (existing) {
      return {
        mode: "live",
        wallet: this.wallet,
        tx: null,
        agent: agent.toBase58(),
        manifest,
        note: "Agent already registered on SAP"
      };
    }

    const ix = await this.client.agent.registerAgent({
      signer: this.keypair,
      wallet,
      agent,
      agentStats,
      globalRegistry,
      name: manifest.name,
      description: manifest.description,
      capabilities: manifest.capabilities,
      pricing: manifest.pricing,
      protocols: manifest.protocols,
      agentId: "probeur",
      agentUri: "https://github.com/nedupowei22/probeur",
      x402Endpoint: null
    });
    const tx = await this.client.buildTransaction([ix], wallet);
    tx.sign([this.keypair]);
    const signature = await this.client.connection.sendTransaction(tx, { maxRetries: 3 });
    await this.client.connection.confirmTransaction(signature, "confirmed");
    return { mode: "live", wallet: this.wallet, tx: signature, agent: agent.toBase58(), manifest };
  }

  async discoverAgents() {
    if (this.mode !== "live") {
      return {
        source: "dry-run-fixture",
        agents: DEMO_AGENTS
      };
    }

    return {
      source: "sap-mainnet-registration-smoke",
      overview: {
        note: "Installed SAP SDK v0.18 exposes registration/instruction modules; network discovery will be wired through SAP CLI or explorer API next."
      },
      agents: DEMO_AGENTS
    };
  }

  async callSentinel(candidate) {
    const payload = {
      sentinel: config.sap.sentinelWallet,
      target: candidate.wallet,
      targetName: candidate.name,
      tools: candidate.tools.map((tool) => tool.name)
    };

    if (this.mode !== "live") {
      const score = 70 + (Number.parseInt(stableId(payload), 16) % 25);
      return {
        mode: "dry-run",
        sentinelWallet: config.sap.sentinelWallet,
        score,
        verdict: score >= 80 ? "pass" : "review",
        tx: `dry-sentinel-${stableId(payload)}`
      };
    }

    return {
      mode: "live",
      sentinelWallet: config.sap.sentinelWallet,
      profileSeen: false,
      target: candidate.wallet,
      tx: null,
      note: "Sentinel direct call deferred until SAP discovery/tool-call endpoint is wired; Sentinel wallet is included in the live proof log."
    };
  }

  async openEscrow(candidate) {
    const serviceHash = Array.from(
      createHash("sha256").update(`${candidate.wallet}:${candidate.name}`).digest()
    );

    if (this.mode !== "live") {
      return {
        mode: "dry-run",
        agentWallet: candidate.wallet,
        serviceHash: Buffer.from(serviceHash).toString("hex"),
        tx: `dry-escrow-${stableId(candidate)}`
      };
    }

    return {
      mode: "live",
      agentWallet: candidate.wallet,
      serviceHash: Buffer.from(serviceHash).toString("hex"),
      tx: null,
      note: "Escrow transaction deferred for smoke test; use after selecting a live SAP counterparty agent PDA."
    };
  }
}

function normalizeProfile(wallet, profile) {
  const agent = profile.agent ?? profile;
  const tools = Array.isArray(profile.tools) ? profile.tools : [];
  return {
    wallet: wallet?.toBase58?.() ?? String(wallet),
    name: agent.name ?? "Unknown SAP Agent",
    protocols: agent.protocols ?? [],
    reputation: Number(agent.reputation ?? agent.reputationScore ?? 0),
    tools: tools.map((tool) => ({
      name: tool.name ?? tool.toolId ?? tool.id ?? "unknown-tool",
      category: tool.category ?? tool.protocolId ?? "unknown",
      priceLamports: Number(tool.priceLamports ?? tool.pricePerCall ?? 0)
    }))
  };
}
