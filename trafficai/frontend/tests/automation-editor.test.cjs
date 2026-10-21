const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  connectionIssue,
  withoutOutput,
} = require("../src/components/automations/graphEditing.ts");
const nodes = [
  { id: "start", kind: "trigger" },
  { id: "condition", kind: "condition" },
  { id: "a", kind: "message" },
  { id: "b", kind: "wait" },
  { id: "end", kind: "end" },
  { id: "note", kind: "note" },
];
test("trocar próxima etapa libera a conexão antiga sem alterar o grafo de origem", () => {
  const edges = [
    { id: "1", source: "start", target: "a" },
    { id: "2", source: "a", target: "end" },
  ];
  assert.equal(connectionIssue(nodes, edges, "start", "b"), null);
  assert.deepEqual(withoutOutput(edges, "start"), [edges[1]]);
  assert.equal(edges.length, 2);
});
test("saídas Sim/Não são independentes e precisam de destino livre", () => {
  const edges = [
    { id: "yes", source: "condition", target: "a", sourceHandle: "yes" },
    { id: "no", source: "condition", target: "b", sourceHandle: "no" },
  ];
  assert.equal(connectionIssue(nodes, edges, "condition", "end", "yes"), null);
  assert.equal(
    connectionIssue(nodes, edges, "condition", "b", "yes"),
    "Esse bloco já recebe outra conexão. Escolha uma etapa livre.",
  );
  assert.deepEqual(withoutOutput(edges, "condition", "yes"), [edges[1]]);
  assert.match(connectionIssue(nodes, edges, "condition", "end"), /Sim ou Não/);
});
test("edição no celular rejeita ciclos mesmo quando o destino parece livre", () => {
  const edges = [{ id: "1", source: "a", target: "b" }];
  assert.match(connectionIssue(nodes, edges, "b", "a"), /ciclo/);
  assert.match(connectionIssue(nodes, [], "a", "a"), /ele mesmo/);
});
test("gatilhos, notas e encerramentos mantêm o sentido das conexões", () => {
  assert.match(connectionIssue(nodes, [], "a", "start"), /não aceita/);
  assert.match(connectionIssue(nodes, [], "end", "a"), /não aceita/);
  assert.match(connectionIssue(nodes, [], "note", "a"), /não aceita/);
  assert.match(connectionIssue(nodes, [], "a", "note"), /não aceita/);
  assert.equal(connectionIssue(nodes, [], "a", "end"), null);
});
