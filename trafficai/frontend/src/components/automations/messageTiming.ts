type TimingNode = { id: string; data: { kind?: unknown; config?: unknown } };
type TimingEdge = { source: string; target: string };

// Sum configured waits before a node. Do not invent a fixed time for
// disconnected nodes, cycles or branches that reach it at different times.
export function messageTimings(nodes: TimingNode[], edges: TimingEdge[]) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const memo = new Map<string, number | null>();
  function arrival(id: string, visiting = new Set<string>()): number | null {
    if (visiting.has(id)) return null;
    if (memo.has(id)) return memo.get(id)!;
    const node = byId.get(id);
    if (!node) return null;
    if (node.data.kind === "trigger") return 0;
    const incoming = edges.filter((edge) => edge.target === id);
    if (!incoming.length) return null;
    const path = new Set(visiting).add(id);
    const times = incoming.map((edge) => {
      const previous = byId.get(edge.source);
      const time = arrival(edge.source, path);
      const config = previous?.data.config as { seconds?: unknown } | undefined;
      const delay = previous?.data.kind === "wait" ? Number(config?.seconds) : 0;
      return time !== null && Number.isFinite(delay) && delay >= 0 ? time + delay : null;
    });
    const result = times.every((time) => time !== null && time === times[0]) ? times[0] : null;
    memo.set(id, result);
    return result;
  }
  return new Map(nodes.filter((node) => node.data.kind === "message").map((node) => [node.id, arrival(node.id)]));
}
