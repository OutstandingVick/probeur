import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { config, requireLiveConfig } from "../config.js";
import { optionalImport, stableId } from "../util.js";

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

    const sap = await optionalImport([
      "@oobe-protocol-labs/synapse-sap-sdk",
      "@synapse-sap/sdk"
    ]);
    const web3 = await optionalImport(["@solana/web3.js"]);
    if (!sap || !web3) {
      throw new Error("Install SAP dependencies with npm install before live mode.");
    }

    const keypairBytes = JSON.parse(readFileSync(config.agent.keypairPath, "utf8"));
    const keypair = web3.Keypair.fromSecretKey(Uint8Array.from(keypairBytes));
    const connectionFactory = sap.SapConnection ?? sap.default?.SapConnection;
    if (!connectionFactory) throw new Error("SapConnection export was not found.");

    const conn =
      config.sap.cluster === "mainnet-beta"
        ? connectionFactory.mainnet(config.sap.rpcUrl)
        : new connectionFactory({ rpcUrl: config.sap.rpcUrl, cluster: config.sap.cluster });

    this.client = conn.fromKeypair(keypair);
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

    const tx = await this.client.agent.register(manifest);
    return { mode: "live", wallet: this.wallet, tx, manifest };
  }

  async discoverAgents() {
    if (this.mode !== "live") {
      return {
        source: "dry-run-fixture",
        agents: DEMO_AGENTS
      };
    }

    const overview = await this.client.discovery.getNetworkOverview();
    const protocolAgents = await this.client.discovery.findAgentsByProtocol("sap");
    const agents = [];

    for (const agent of protocolAgents.slice(0, config.run.maxToolsPerRun * 2)) {
      const wallet = agent.wallet?.toBase58?.() ?? agent.wallet ?? agent.authority ?? agent.publicKey;
      try {
        const profile = await this.client.discovery.getAgentProfile(wallet);
        agents.push(normalizeProfile(wallet, profile));
      } catch {
        agents.push(normalizeProfile(wallet, { agent, tools: [] }));
      }
    }

    return { source: "sap-mainnet", overview, agents };
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

    const profile = await this.client.discovery.getAgentProfile(config.sap.sentinelWallet);
    return {
      mode: "live",
      sentinelWallet: config.sap.sentinelWallet,
      profileSeen: Boolean(profile),
      target: candidate.wallet,
      tx: null,
      note: "Sentinel profile fetched as required service touchpoint; wire direct tool call when Sentinel exposes a callable endpoint."
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

    const bnModule = await optionalImport(["bn.js"]);
    const BN = bnModule?.default ?? bnModule;
    if (!BN) throw new Error("bn.js is required for SAP escrow live mode.");

    const agentWallet = candidate.wallet;
    const createTx = await this.client.escrow.create(agentWallet, {
      pricePerCall: new BN(config.sap.escrowPricePerCallLamports),
      maxCalls: new BN(config.sap.escrowMaxCalls),
      initialDeposit: new BN(config.sap.escrowInitialDepositLamports),
      expiresAt: new BN(0),
      volumeCurve: [],
      tokenMint: null,
      tokenDecimals: 9
    });

    return {
      mode: "live",
      agentWallet,
      serviceHash: Buffer.from(serviceHash).toString("hex"),
      tx: createTx
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
