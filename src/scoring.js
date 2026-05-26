import { clamp } from "./util.js";

export function selectCandidates(agents, limit) {
  return agents
    .flatMap((agent) => {
      const tools = agent.tools.length ? agent.tools : [{ name: "profile", category: "agent" }];
      return tools.map((tool) => ({
        wallet: agent.wallet,
        name: agent.name,
        protocols: agent.protocols,
        reputation: agent.reputation,
        tool,
        tools: [tool],
        selectionScore: scoreCandidate(agent, tool)
      }));
    })
    .sort((a, b) => b.selectionScore - a.selectionScore)
    .slice(0, limit);
}

function scoreCandidate(agent, tool) {
  const reputation = clamp(Number(agent.reputation ?? 0), 0, 100);
  const price = Number(tool.priceLamports ?? 0);
  const priceScore = price > 0 ? clamp(100 - price / 50_000, 10, 100) : 60;
  const protocolScore = agent.protocols?.includes("sap") ? 10 : 0;
  return Math.round(reputation * 0.65 + priceScore * 0.25 + protocolScore);
}
