// Shared by canvas connections and the accessible step selector.
export type EditableNode = { id: string; kind: string };
export type EditableEdge = {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
};
const sameOutput = (
  edge: EditableEdge,
  source: string,
  handle?: string | null,
) => edge.source === source && (edge.sourceHandle || null) === (handle || null);
export function connectionIssue(
  nodes: EditableNode[],
  edges: EditableEdge[],
  source: string,
  target: string,
  handle?: string | null,
): string | null {
  const from = nodes.find((n) => n.id === source),
    to = nodes.find((n) => n.id === target);
  if (!from || !to) return "Selecione dois blocos existentes.";
  if (source === target) return "Um bloco não pode apontar para ele mesmo.";
  if (
    ["end", "note"].includes(from.kind) ||
    ["trigger", "note"].includes(to.kind)
  )
    return "Este tipo de bloco não aceita essa conexão.";
  if (from.kind === "condition" && !["yes", "no"].includes(handle || ""))
    return "Escolha a saída Sim ou Não da condição.";
  if (from.kind !== "condition" && handle)
    return "Esta saída não pertence ao bloco.";
  const remaining = edges.filter((e) => !sameOutput(e, source, handle));
  if (remaining.some((e) => e.target === target))
    return "Esse bloco já recebe outra conexão. Escolha uma etapa livre.";
  const visited = new Set<string>(),
    pending = [target];
  while (pending.length) {
    const id = pending.pop()!;
    if (id === source)
      return "Essa conexão criaria um ciclo. Escolha uma etapa adiante.";
    if (visited.has(id)) continue;
    visited.add(id);
    pending.push(
      ...remaining.filter((e) => e.source === id).map((e) => e.target),
    );
  }
  return null;
}
export function withoutOutput<T extends EditableEdge>(
  edges: T[],
  source: string,
  handle?: string | null,
): T[] {
  return edges.filter((e) => !sameOutput(e, source, handle));
}
