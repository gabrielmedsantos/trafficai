"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAutomationNavigation } from "./NavigationGuard";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
  type Node,
  type Edge,
  type NodeChange,
  type EdgeChange,
  type Connection,
  type NodeProps,
  type ReactFlowInstance,
  type OnConnectEnd,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  ArrowLeft,
  Save,
  Play,
  Upload,
  Undo2,
  Redo2,
  Trash2,
  Plus,
  CheckCircle2,
  Settings2,
  Layers,
  ListOrdered,
  Network,
  X,
  ArrowRight,
  AlertCircle,
  Clock3,
  MessageSquare,
  GitBranch,
  Bot,
  Webhook,
  Tag,
  Flag,
  FileText,
  Zap,
  ClipboardList,
  Contact,
  Maximize2,
  Minimize2,
} from "lucide-react";
import {
  workflows as w,
  labels,
  colors,
  type Flow,
  type Catalog,
  type Config,
  type RecordRow,
  type Run,
  type Item,
  type Offer,
  type GraphNode,
  type GraphEdge,
} from "./api";
import DurationField, { describeWait } from "./DurationField";
import ModalFrame from "./ModalFrame";
import MessageContent from "./MessageContent";
import { messageTimings } from "./messageTiming";
import { ErrorFeedback, LoadingState } from "./Feedback";
import { connectionIssue, withoutOutput } from "./graphEditing";
const listenMobile = (callback: () => void) => {
  const media = window.matchMedia("(max-width: 1100px)");
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
};
const mobileSnapshot = () => window.matchMedia("(max-width: 1100px)").matches;
const blockIcons: Record<string, typeof Zap> = {
  trigger: Zap,
  condition: GitBranch,
  wait: Clock3,
  message: MessageSquare,
  tag: Tag,
  update_contact: Contact,
  crm_task: ClipboardList,
  agent: Bot,
  webhook: Webhook,
  end: Flag,
  note: FileText,
};
type Snapshot = { nodes: Node[]; edges: Edge[] };
function Block({ data, selected }: NodeProps) {
  const kind = String(data.kind),
    Icon = blockIcons[kind] || Layers;
  return (
    <div
      className={
        "aw-node " +
        (selected ? "selected " : "") +
        (data.invalid ? "invalid" : "")
      }
      style={{ borderTop: "3px solid " + colors[kind] }}
    >
      {kind !== "trigger" && <Handle type="target" position={Position.Left} />}
      <div className="kind" style={{ color: colors[kind] }}>
        <Icon size={13} />
        {labels[kind]}
      </div>
      <strong>{String(data.label)}</strong>
      <small>
        {String(
          data.subtitle ||
            (kind === "end"
              ? "Encerra esta execução"
              : kind === "note"
                ? "Anotação do fluxo"
                : "Configure este bloco"),
        )}
      </small>
      {!["end", "note"].includes(kind) &&
        (kind === "condition" ? (
          <>
            <Handle
              type="source"
              position={Position.Right}
              id="yes"
              style={{ top: "40%", background: "#34d399" }}
            />
            <Handle
              type="source"
              position={Position.Right}
              id="no"
              style={{ top: "75%", background: "#fb7185" }}
            />
            <small>Sim ↗ · Não ↘</small>
          </>
        ) : (
          <Handle type="source" position={Position.Right} />
        ))}
      {!!data.messagePreview && <small style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{String(data.messagePreview)}</small>}
      {!!data.timing && <small><Clock3 size={13} /> {String(data.timing)}</small>}
      {!!data.state && (
        <small>{labels[String(data.state)] || String(data.state)}</small>
      )}
    </div>
  );
}
const nodeTypes = { block: Block };
const defaults: Record<string, Config> = {
  trigger: { event: "manual" },
  condition: { kind: "order_status", value: "approved" },
  wait: { seconds: 3600 },
  message: { channel: "email" },
  tag: { operation: "add", tag: "" },
  update_contact: { field: "title", value: "" },
  crm_task: { title: "" },
  end: {},
  note: {},
};
const eventLabels: Record<string, string> = {
  manual: "Início manual",
  "checkout.started": "Checkout iniciado",
  "checkout.abandoned": "Checkout abandonado",
  "checkout.recovery": "Compra não concluída (recuperação)",
  "quiz.abandoned": "Quiz interrompido",
  "payment.approved": "Pagamento aprovado",
  "payment.failed": "Pagamento recusado",
  "payment.expired": "Pagamento expirado",
  "refund.completed": "Reembolso",
  "chargeback.received": "Chargeback",
};
export default function FlowEditor({ id }: { id: string }) {
  const router = useRouter(),
    { register } = useAutomationNavigation();
  const [flow, setFlow] = useState<Flow | null>(null),
    [nodes, setNodes] = useState<Node[]>([]),
    [edges, setEdges] = useState<Edge[]>([]),
    [selected, setSelected] = useState<string | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [issues, setIssues] = useState<{ nodeId?: string; message: string }[]>([]),
    [busy, setBusy] = useState(false),
    [dirty, setDirty] = useState(false),
    [catalog, setCatalog] = useState<Partial<Catalog>>({}),
    [templates, setTemplates] = useState<RecordRow[]>([]),
    [products, setProducts] = useState<(Item & { offers?: Offer[] })[]>([]),
    [history, setHistory] = useState<Snapshot[]>([]),
    [future, setFuture] = useState<Snapshot[]>([]),
    [run, setRun] = useState<Run | null>(null),
    [confirm, setConfirm] = useState(false),
    [leaveTo, setLeaveTo] = useState<string | null>(null),
    [view, setView] = useState<"steps" | "canvas" | null>(null),
    [panel, setPanel] = useState<"library" | "inspector" | null>(null),
    [libraryTab, setLibraryTab] = useState<"blocks" | "settings">("blocks");
  const isMobile = useSyncExternalStore(
    listenMobile,
    mobileSnapshot,
    () => false,
  );
  const [expanded, setExpanded] = useState(false);
  const expandButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!expanded) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onEscape = (event: KeyboardEvent) => {
      // Configuration and confirmation dialogs handle Escape first.
      if (event.key === "Escape" && !document.querySelector('[aria-modal="true"]')) {
        event.preventDefault();
        setExpanded(false);
        expandButton.current?.focus();
      }
    };
    window.addEventListener("keydown", onEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onEscape);
    };
  }, [expanded]);
  const currentView = view || (isMobile ? "steps" : "canvas");
  const canvas = useRef<ReactFlowInstance | null>(null);
  const choose = (nodeId: string) => {
    setSelected(nodeId);
    setPanel("inspector");
  };
  useEffect(
    () =>
      register((href) => {
        if (!dirty) return true;
        setLeaveTo(href);
        return false;
      }),
    [dirty, register],
  );
  const graphRef = useRef<Snapshot>({ nodes: [], edges: [] });
  useEffect(() => {
    graphRef.current = { nodes, edges };
  }, [nodes, edges]);
  const fromFlow = useCallback((f: Flow) => {
    setFlow(f);
    setNodes(
      f.graph.nodes.map((n: GraphNode) => ({
        ...n,
        type: "block",
        data: {
          ...n.data,
          kind: n.type,
          subtitle:
            n.type === "trigger"
              ? eventLabels[n.data.config.event || ""] || n.data.config.event
              : n.type === "wait"
                ? describeWait(Number(n.data.config.seconds))
                : labels[n.data.config.channel || ""] || "",
        },
      })),
    );
    setEdges(
      f.graph.edges.map((e: GraphEdge) => ({
        ...e,
        label:
          e.sourceHandle === "yes"
            ? "Sim"
            : e.sourceHandle === "no"
              ? "Não"
              : undefined,
        style: {
          stroke:
            e.sourceHandle === "no"
              ? "#fb7185"
              : e.sourceHandle === "yes"
                ? "#34d399"
                : "#566273",
        },
      })),
    );
    setDirty(false);
  }, []);
  useEffect(() => {
    Promise.all([
      w.get<Flow>("/flows/" + id),
      w.get<Catalog>("/catalog"),
      w.get<RecordRow[]>("/templates"),
      w.get<(Item & { offers?: Offer[] })[]>("/products"),
    ])
      .then(([f, c, t, p]) => {
        fromFlow(f);
        setCatalog(c);
        setTemplates(t);
        setProducts(p);
      })
      .catch((e) => setError(e.message));
  }, [id, fromFlow]);
  useEffect(() => {
    const fn = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", fn);
    return () => window.removeEventListener("beforeunload", fn);
  }, [dirty]);
  useEffect(() => {
    if (
      !run ||
      ["completed", "failed", "intervention", "canceled"].includes(run.status)
    )
      return;
    const timer = setTimeout(() => {
      w.get<Run>("/runs/" + run.id)
        .then(setRun)
        .catch((e) => setError(e.message));
    }, 2000);
    return () => clearTimeout(timer);
  }, [run]);
  const snapshot = useCallback(() => {
    setHistory((h) => [...h.slice(-39), structuredClone(graphRef.current)]);
    setFuture([]);
    setDirty(true);
    setNotice("");
  }, []);
  const changeNodes = useCallback((changes: NodeChange[]) => {
    if (changes.some((c) => c.type === "remove" || c.type === "position"))
      setDirty(true);
    setNodes((ns) => applyNodeChanges(changes, ns));
  }, []);
  const changeEdges = useCallback((changes: EdgeChange[]) => {
    if (changes.some((c) => c.type === "remove")) setDirty(true);
    setEdges((es) => applyEdgeChanges(changes, es));
  }, []);
  const connect = (c: Connection) => {
    const message = connectionIssue(
      nodes.map((n) => ({ id: n.id, kind: String(n.data.kind) })),
      edges,
      c.source,
      c.target,
      c.sourceHandle,
    );
    if (message) {
      setError(message);
      return;
    }
    snapshot();
    setError("");
    setEdges((es) =>
      addEdge(
        {
          ...c,
          label:
            c.sourceHandle === "yes"
              ? "Sim"
              : c.sourceHandle === "no"
                ? "Não"
                : undefined,
          style: {
            stroke:
              c.sourceHandle === "no"
                ? "#fb7185"
                : c.sourceHandle === "yes"
                  ? "#34d399"
                  : "#748196",
          },
        },
        withoutOutput(es, c.source, c.sourceHandle),
      ),
    );
  };
  const nextStep = (target: string, handle?: string) => {
    if (!selected) return;
    if (!target) {
      snapshot();
      setEdges((es) => withoutOutput(es, selected, handle));
      return;
    }
    connect({
      source: selected,
      target,
      sourceHandle: handle || null,
      targetHandle: null,
    });
  };
  const [pendingStep, setPendingStep] = useState<{
    source: string;
    handle: string | null;
    position: { x: number; y: number };
  } | null>(null);
  const finishConnection: OnConnectEnd = (event, state) => {
    if (state.isValid || state.toNode || state.fromHandle?.type !== "source" || !state.fromNode) return;
    const target = event.target;
    if (!(target instanceof Element) || !target.closest(".react-flow__pane")) return;
    const point = "changedTouches" in event ? event.changedTouches[0] : event;
    if (!point || !canvas.current) return;
    setPendingStep({
      source: state.fromNode.id,
      handle: state.fromHandle.id || null,
      position: canvas.current.screenToFlowPosition({ x: point.clientX, y: point.clientY }),
    });
  };
  const add = (kind: string, fromDrop = false) => {
    const pending = fromDrop ? pendingStep : null;
    const next = "n_" + crypto.randomUUID().replaceAll("-", "");
    if (pending) {
      const message = connectionIssue(
        [...nodes.map((n) => ({ id: n.id, kind: String(n.data.kind) })), { id: next, kind }],
        edges, pending.source, next, pending.handle,
      );
      if (message) { setError(message); setPendingStep(null); return; }
    }
    snapshot();
    setNodes((ns) => [
      ...ns,
      {
        id: next,
        type: "block",
        position: pending?.position || {
          x: 230 + (ns.length % 3) * 250,
          y: 100 + Math.floor(ns.length / 3) * 160,
        },
        data: { kind, label: labels[kind], config: { ...defaults[kind] } },
      },
    ]);
    if (pending) {
      const handle = pending.handle;
      setEdges((es) => addEdge({
        source: pending.source, target: next, sourceHandle: handle, targetHandle: null,
        label: handle === "yes" ? "Sim" : handle === "no" ? "Não" : undefined,
        style: { stroke: handle === "no" ? "#fb7185" : handle === "yes" ? "#34d399" : "#748196" },
      }, withoutOutput(es, pending.source, handle)));
    }
    setPendingStep(null);
    setError("");
    setSelected(next);
    setPanel("inspector");
  };
  const chosen = nodes.find((n) => n.id === selected),
    config = (chosen?.data.config || {}) as Config;
  function update(data: Partial<Node["data"]>) {
    snapshot();
    setNodes((ns) =>
      ns.map((n) =>
        n.id === selected
          ? {
              ...n,
              data: {
                ...n.data,
                ...data,
                ...(data.config
                  ? {
                      subtitle:
                        n.data.kind === "trigger"
                          ? eventLabels[(data.config as Config).event || ""] ||
                            (data.config as Config).event
                          : n.data.kind === "wait"
                            ? describeWait(
                                Number((data.config as Config).seconds),
                              )
                            : labels[(data.config as Config).channel || ""] ||
                              "",
                    }
                  : {}),
              },
            }
          : n,
      ),
    );
  }
  function field(key: string, value: string | number | boolean) {
    update({
      ...(key === "seconds" &&
      chosen &&
      (chosen.data.label === "Espera" ||
        /^Aguardar \d/.test(String(chosen.data.label)))
        ? { label: "Aguardar " + describeWait(Number(value)) }
        : {}),
      config:
        key === "channel"
          ? { channel: String(value) }
          : { ...config, [key]: value },
    });
  }
  function undo() {
    if (!history.length) return;
    setFuture((f) => [structuredClone({ nodes, edges }), ...f]);
    const prev = history[history.length - 1];
    setNodes(prev.nodes);
    setEdges(prev.edges);
    setHistory((h) => h.slice(0, -1));
    setDirty(true);
  }
  function redo() {
    if (!future.length) return;
    setHistory((h) => [...h, structuredClone({ nodes, edges })]);
    setNodes(future[0].nodes);
    setEdges(future[0].edges);
    setFuture((f) => f.slice(1));
    setDirty(true);
  }
  async function save() {
    if (!flow) return null;
    const graph = {
      schemaVersion: 1,
      nodes: nodes.map((n) => ({
        id: n.id,
        type: n.data.kind,
        position: n.position,
        data: { label: n.data.label, config: n.data.config || {} },
      })),
      edges: edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle || undefined,
      })),
    };
    const f = await w.put<Flow>("/flows/" + id, { ...flow, graph });
    setFlow(f);
    setDirty(false);
    setNotice("Rascunho salvo");
    return f;
  }
  async function action(kind: string) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (kind === "save") {
        await save();
      }
      if (kind === "validate") {
        if (dirty) await save();
        const result = await w.post<{
          issues: { nodeId?: string; message: string }[];
        }>("/flows/" + id + "/validate");
        setIssues(result.issues);
        if (!result.issues.length) setNotice("Fluxo válido para publicação");
      }
      if (kind === "publish") {
        if (dirty) await save();
        const f = await w.post<Flow>("/flows/" + id + "/publish");
        setFlow(f);
        setConfirm(false);
        setNotice(
          "Versão " +
            f.published_version +
            " publicada. Envios reais " +
            (catalog.sendEnabled ? "habilitados" : "desativados") +
            ".",
        );
      }
      if (kind === "test") {
        if (dirty) throw Error("Salve e publique a versão que deseja testar.");
        const r = await w.post<Run>("/flows/" + id + "/test", {});
        setRun(await w.get<Run>("/runs/" + r.id));
        setNotice(
          "Teste da versão publicada enfileirado: sem envios ou alterações no CRM.",
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha na operação");
    } finally {
      setBusy(false);
    }
  }
  const select = (
    label: string,
    key: keyof Config,
    options: { id: string; name?: string }[],
  ) => (
    <label>
      {label}
      <select
        value={String(config[key] ?? "")}
        onChange={(e) => field(key, e.target.value)}
      >
        <option value="">Selecionar</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
    </label>
  );
  if (!flow)
    return error ? (
      <ErrorFeedback message={error} />
    ) : (
      <LoadingState label="Preparando seu editor…" />
    );
  const timings = messageTimings(nodes, edges);
  const timingLabel = (nodeId: string) => {
    const seconds = timings.get(nodeId);
    return seconds == null
      ? "Previsão indefinida: verifique os caminhos e as conexões"
      : seconds === 0
        ? "Sem espera programada após o gatilho"
        : describeWait(seconds) + " após o gatilho";
  };
  const messagePreview = (node: Node) => {
    const c = node.data.config as Config;
    const template = templates.find(t => t.id === c?.templateId && t.channel === c?.channel);
    return template ? [template.name, c.channel === "email" ? template.subject : template.body].filter(Boolean).join(" · ").slice(0, 180) : "Selecione ou crie uma mensagem";
  };
  const invalidIds = new Set(issues.map((i) => i.nodeId));
  const runStates: Record<string, string> = {};
  for (const j of run?.jobs || []) runStates[j.node_id] = j.status;
  const orderedNodes: Node[] = [],
    seen = new Set<string>();
  const visit = (node: Node) => {
    if (seen.has(node.id)) return;
    seen.add(node.id);
    orderedNodes.push(node);
    for (const edge of edges.filter((e) => e.source === node.id)) {
      const next = nodes.find((n) => n.id === edge.target);
      if (next) visit(next);
    }
  };
  nodes.filter((n) => n.data.kind === "trigger").forEach(visit);
  nodes.forEach(visit);
  const libraryPanel = (
    <aside
      className="aw-palette"
      role={isMobile ? "dialog" : undefined}
      aria-modal={isMobile || undefined}
      aria-label="Biblioteca e ajustes do fluxo"
    >
      <div className="aw-panel-heading">
        <h3>Seu fluxo</h3>
        <button
          className="aw-mobile-close"
          aria-label="Fechar biblioteca"
          onClick={() => setPanel(null)}
        >
          <X size={18} />
        </button>
      </div>
      <div className="aw-panel-tabs">
        <button
          aria-pressed={libraryTab === "blocks"}
          onClick={() => setLibraryTab("blocks")}
        >
          <Layers size={14} />
          Blocos
        </button>
        <button
          aria-pressed={libraryTab === "settings"}
          onClick={() => setLibraryTab("settings")}
        >
          <Settings2 size={14} />
          Ajustes
        </button>
      </div>
      {libraryTab === "blocks" ? (
        <div className="aw-block-library">
          {[
            "trigger",
            "condition",
            "wait",
            "message",
            "tag",
            "update_contact",
            "crm_task",
            "agent",
            "webhook",
            "end",
            "note",
          ].map((kind) => (
            <button
              key={kind}
              onClick={() => add(kind)}
              style={{ borderLeft: "3px solid " + colors[kind] }}
            >
              <span
                className="aw-block-dot"
                style={{ background: colors[kind] }}
              />
              <span>{labels[kind]}</span>
              <Plus size={13} className="aw-add-icon" />
            </button>
          ))}
          <p className="aw-panel-help">
            Adicione um bloco e escolha a próxima etapa na configuração. No
            canvas, você também pode ligar as saídas.
          </p>
        </div>
      ) : (
        <div className="aw-flow-settings">
          <label>
            Nome
            <input
              value={flow.name}
              onChange={(e) => {
                setFlow({ ...flow, name: e.target.value });
                setDirty(true);
              }}
            />
          </label>
          <label>
            Produto
            <select
              value={flow.product_id || ""}
              onChange={(e) => {
                setFlow({ ...flow, product_id: e.target.value || null });
                setDirty(true);
              }}
            >
              <option value="">Todos</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Fonte
            <select
              value={flow.source_id || ""}
              onChange={(e) => {
                setFlow({ ...flow, source_id: e.target.value || null });
                setDirty(true);
              }}
            >
              <option value="">Todas</option>
              {catalog.sources?.map((p: Item) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>
              <input
                type="checkbox"
                checked={flow.recovery}
                onChange={(e) => {
                  setFlow({ ...flow, recovery: e.target.checked, settings: { ...flow.settings,
                    sales_mode: e.target.checked ? "recovery" : flow.settings.sales_mode === "recovery" ? null : flow.settings.sales_mode,
                    ...(e.target.checked ? { promotion_product_id: null, promotion_offer_id: null } : {}),
                  } });
                  setDirty(true);
                }}
              />{" "}
              Recuperação
            </span>
            <small>Cancela após aprovação do pedido.</small>
          </label>
          <label>
            WhatsApp padrão do fluxo
            <select
              value={String(flow.settings.default_whatsapp_connection_id || "")}
              onChange={(e) => {
                setFlow({
                  ...flow,
                  settings: {
                    ...flow.settings,
                    default_whatsapp_connection_id: e.target.value || null,
                  },
                });
                setDirty(true);
              }}
            >
              <option value="">Sem padrão</option>
              {catalog.integrations
                ?.filter((i) =>
                  [
                    "whatsapp_cloud",
                    "whatsapp_evolution",
                    "whatsapp_uazapi",
                  ].includes(i.provider || ""),
                )
                .map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name} · {labels[i.provider || ""] || i.provider}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Pasta
            <select value={flow.settings.folder === "templates" ? "templates" : "mine"} onChange={(e) => {
              setFlow({ ...flow, settings: { ...flow.settings, folder: e.target.value === "templates" ? "templates" : null } }); setDirty(true);
            }}>
              <option value="mine">Meus fluxos</option>
              <option value="templates">Templates</option>
            </select>
          </label>
          <label>
            Finalidade do modelo de vendas
            <select value={String(flow.settings.sales_mode || "")} onChange={(e) => {
              setFlow({ ...flow, recovery: e.target.value === "recovery", settings: { ...flow.settings, sales_mode: e.target.value || null,
                ...(e.target.value === "recovery" ? { promotion_product_id: null, promotion_offer_id: null } : {}),
              } }); setDirty(true);
            }}>
              <option value="">Fluxo personalizado</option>
              <option value="recovery">Recuperação de compra</option>
              <option value="purchase_tags">Marcar compra aprovada</option>
              <option value="upsell">Upsell / outra oferta</option>
            </select>
          </label>
          {!flow.recovery && <>
            <label>
              Produto oferecido (upsell)
              <select value={String(flow.settings.promotion_product_id || "")} onChange={(e) => {
                setFlow({ ...flow, settings: { ...flow.settings, promotion_product_id: e.target.value || null, promotion_offer_id: null } }); setDirty(true);
              }}>
                <option value="">Sem oferta adicional</option>
                {products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
              </select>
              <small>O produto de entrada identifica quem iniciou o fluxo. O produto oferecido define o link e interrompe a oferta se já houver compra aprovada.</small>
            </label>
            {!!flow.settings.promotion_product_id && <label>
              Oferta do produto
              <select value={String(flow.settings.promotion_offer_id || "")} onChange={(e) => {
                setFlow({ ...flow, settings: { ...flow.settings, promotion_offer_id: e.target.value || null } }); setDirty(true);
              }}>
                <option value="">Produto principal</option>
                {(products.find((p) => p.id === flow.settings.promotion_product_id)?.offers || []).map((offer) => <option key={offer.id} value={offer.id}>{offer.name}</option>)}
              </select>
            </label>}
          </>}
          <label>
            <span>
              <input
                type="checkbox"
                checked={flow.settings.stop_on_purchase === true}
                disabled={!flow.product_id || !!flow.settings.promotion_product_id}
                onChange={(e) => {
                  setFlow({
                    ...flow,
                    settings: {
                      ...flow.settings,
                      stop_on_purchase: e.target.checked,
                    },
                  });
                  setDirty(true);
                }}
              />{" "}
              Interromper após comprar o produto de entrada
            </span>
            <small>No upsell, a compra do produto oferecido é verificada automaticamente, sem encerrar só pela compra de entrada.</small>
          </label>
          <label>
            Início dos envios (hora)
            <input
              type="number"
              min={0}
              max={23}
              value={Number(flow.settings.allowed_start ?? 8)}
              onChange={(e) => {
                setFlow({
                  ...flow,
                  settings: {
                    ...flow.settings,
                    allowed_start: Number(e.target.value),
                  },
                });
                setDirty(true);
              }}
            />
          </label>
          <label>
            Fim dos envios (hora)
            <input
              type="number"
              min={1}
              max={24}
              value={Number(flow.settings.allowed_end ?? 20)}
              onChange={(e) => {
                setFlow({
                  ...flow,
                  settings: {
                    ...flow.settings,
                    allowed_end: Number(e.target.value),
                  },
                });
                setDirty(true);
              }}
            />
          </label>
          <label>
            Fuso horário
            <input
              value={String(flow.settings.time_zone || "America/Fortaleza")}
              onChange={(e) => {
                setFlow({
                  ...flow,
                  settings: { ...flow.settings, time_zone: e.target.value },
                });
                setDirty(true);
              }}
            />
          </label>
        </div>
      )}
    </aside>
  );
  const inspectorPanel = (
    <aside
      className="aw-inspector"
      role={isMobile ? "dialog" : undefined}
      aria-modal={isMobile || undefined}
      aria-label={
        chosen
          ? "Configuração da etapa"
          : run
            ? "Resultado da simulação"
            : "Configuração da etapa"
      }
    >
      {isMobile && error && <ErrorFeedback message={error} />}
      <div className="aw-panel-heading">
        <h3>
          {chosen
            ? "Configurar etapa"
            : run
              ? "Resultado da simulação"
              : "Configuração"}
        </h3>
        <button
          className="aw-mobile-close"
          aria-label="Fechar configuração"
          onClick={() => setPanel(null)}
        >
          <X size={18} />
        </button>
      </div>
      {chosen ? (
        <>
          <label>
            Nome do bloco
            <input
              value={String(chosen.data.label)}
              onChange={(e) => update({ label: e.target.value })}
            />
          </label>
          <small style={{ color: colors[String(chosen.data.kind)] }}>
            {labels[String(chosen.data.kind)]} · Etapa{" "}
            {orderedNodes.findIndex((n) => n.id === chosen.id) + 1}
          </small>
          <div style={{ height: 16 }} />
          {chosen.data.kind === "trigger" &&
            select(
              "Evento",
              "event",
              Object.entries(eventLabels).map(([id, name]) => ({
                id,
                name,
              })),
            )}
          {chosen.data.kind === "wait" && (
            <DurationField
              key={chosen.id}
              seconds={Number(config.seconds || 0)}
              onChange={(value) => field("seconds", value)}
            />
          )}
          {chosen.data.kind === "condition" && (
            <>
              <small>Para verificar compra por tag, use {"{{product_tag}}"} (entrada) ou {"{{promotion_tag}}"} (oferta). Pedidos aprovados também são consultados pelo motor.</small>
              {select("Condição", "kind", [
                { id: "order_status", name: "Estado do pedido" },
                { id: "product_purchased", name: "Já comprou o produto" },
                { id: "has_tag", name: "Contato tem tag" },
                { id: "field_equals", name: "Campo do CRM" },
                { id: "channel_available", name: "Canal disponível" },
                { id: "message_sent", name: "Mensagem enviada" },
                { id: "message_clicked", name: "Houve clique" },
                { id: "message_delivered", name: "Entrega confirmada" },
              ])}
              {config.kind === "field_equals" &&
                select("Campo", "field", [
                  { id: "title", name: "Título" },
                  { id: "contact_name", name: "Nome" },
                  { id: "status", name: "Estado" },
                ])}
              {config.kind === "product_purchased" && select("Produto comprado", "productId", products)}
              {config.kind !== "product_purchased" && <label>
                Valor para comparar
                <input
                  value={config.value || ""}
                  onChange={(e) => field("value", e.target.value)}
                />
              </label>
              }
              <p>
                Saída verde: Sim. Saída rosa: Não. Conecte as duas a caminhos
                com término.
              </p>
            </>
          )}
          {chosen.data.kind === "message" && (
            <>
              <div className="aw-feedback" role="status">
                <strong><Clock3 size={16} /> Previsão de envio</strong>
                <p>{timingLabel(chosen.id)}</p>
                <small>Soma das esperas anteriores a esta mensagem. Para mudar o prazo, edite os blocos de espera antes dela. É uma previsão relativa ao gatilho, não um horário de um contato; limites de envio, processamento e novas tentativas podem adiar o envio.</small>
              </div>
              {select(
                "Canal",
                "channel",
                ["email", "whatsapp", "sms"].map((id) => ({
                  id,
                  name: labels[id],
                })),
              )}
              {select(
                "Modelo",
                "templateId",
                templates.filter((t) => t.channel === config.channel),
              )}
              {select("Produto oferecido neste bloco (opcional)", "promotionProductId", products.filter(p => !!p.checkout_url))}
              <label>Texto do botão de compra<input maxLength={60} value={config.buttonText || ""} onChange={e => field("buttonText", e.target.value)} /></label>
              {config.promotionProductId && <small>A oferta será pulada se este produto já tiver compra aprovada. O botão usa o checkout cadastrado no produto.</small>}
              {config.priorityOffer && <p>Oferta de prioridade: só envia para pedido ainda não entregue e criado há menos de 2 horas.</p>}
              {(config.excludePurchasedProductIds || []).length > 0 && <p>Não oferecer se já comprou: {(config.excludePurchasedProductIds || []).map((id: string) => products.find(p => p.id === id)?.name || id).join(", ")}.</p>}
              <MessageContent
                key={chosen.id + ":" + config.channel + ":" + config.templateId}
                channel={String(config.channel || "email")}
                template={templates.find(t => t.id === config.templateId && t.channel === config.channel)}
                onSaved={(template) => {
                  setTemplates(current => [template, ...current]);
                  field("templateId", template.id);
                }}
              />
              {select(
                "Conexão de envio",
                "integrationId",
                (catalog.integrations || []).filter((i: Item) =>
                  config.channel === "whatsapp"
                    ? [
                        "whatsapp_cloud",
                        "whatsapp_evolution",
                        "whatsapp_uazapi",
                      ].includes(i.provider || "")
                    : i.provider ===
                      (config.channel === "email"
                        ? "resend"
                        : config.channel === "sms"
                          ? "twilio"
                          : "whatsapp_cloud"),
                ),
              )}
              <p>
                Escolha a conexão que enviará esta mensagem. No WhatsApp, você
                também pode usar o padrão definido nos ajustes do fluxo.
              </p>
            </>
          )}
          {chosen.data.kind === "tag" && (
            <>
              {select("Operação", "operation", [
                { id: "add", name: "Adicionar" },
                { id: "remove", name: "Remover" },
              ])}
              <label>
                Tag
                <input
                  value={config.tag || ""}
                  onChange={(e) => field("tag", e.target.value)}
                />
              </label>
            </>
          )}
          {chosen.data.kind === "update_contact" && (
            <>
              {select("Campo do CRM", "field", [
                { id: "title", name: "Título" },
                { id: "contact_name", name: "Nome" },
              ])}
              <label>
                Novo valor
                <input
                  value={config.value || ""}
                  onChange={(e) => field("value", e.target.value)}
                />
              </label>
            </>
          )}
          {chosen.data.kind === "crm_task" && (
            <label>
              Título da tarefa
              <input
                value={config.title || ""}
                onChange={(e) => field("title", e.target.value)}
              />
            </label>
          )}
          {["agent", "webhook"].includes(String(chosen.data.kind)) && (
            <>
              {select(
                "Integração configurada",
                "integrationId",
                (catalog.integrations || []).filter(
                  (i) =>
                    i.provider ===
                    (chosen.data.kind === "agent"
                      ? "agent_webhook"
                      : "webhook"),
                ),
              )}
              <label>
                Instrução / contexto (sem dados pessoais por padrão)
                <textarea
                  value={config.prompt || ""}
                  onChange={(e) => field("prompt", e.target.value)}
                />
              </label>
              {chosen.data.kind === "agent" && (
                <label>
                  <span>
                    <input
                      type="checkbox"
                      checked={config.costApproved === true}
                      onChange={(e) => field("costApproved", e.target.checked)}
                    />{" "}
                    Autorizo o custo máximo por chamada indicado na integração
                  </span>
                  <small>
                    {(() => {
                      const i = catalog.integrations?.find(
                        (x) => x.id === config.integrationId,
                      );
                      return i?.config?.paid
                        ? String(i.config.cost_per_call) +
                            " " +
                            i.config.currency +
                            " por chamada (teto informado ao agente)"
                        : "Integração sem cobrança declarada. Nenhuma chamada será feita no teste.";
                    })()}
                  </small>
                </label>
              )}
              <p>
                O endpoint deve devolver execution_id, status completed e
                output.result. O teste simula esta ação. A ativação real depende
                de autorização separada.
              </p>
            </>
          )}
          {chosen.data.kind === "note" && (
            <label>
              Anotação
              <textarea
                value={config.text || ""}
                onChange={(e) => field("text", e.target.value)}
              />
            </label>
          )}
          {!["end", "note"].includes(String(chosen.data.kind)) && (
            <div className="aw-next-step">
              <h4>Continuar o fluxo</h4>
              {(chosen.data.kind === "condition" ? ["yes", "no"] : [""]).map(
                (handle) => (
                  <label key={handle}>
                    {handle === "yes"
                      ? "Se Sim, seguir para"
                      : handle === "no"
                        ? "Se Não, seguir para"
                        : "Próxima etapa"}
                    <select
                      value={
                        edges.find(
                          (e) =>
                            e.source === selected &&
                            (e.sourceHandle || "") === handle,
                        )?.target || ""
                      }
                      onChange={(e) =>
                        nextStep(e.target.value, handle || undefined)
                      }
                    >
                      <option value="">Sem conexão</option>
                      {nodes
                        .filter(
                          (n) =>
                            n.id !== selected &&
                            !["trigger", "note"].includes(String(n.data.kind)),
                        )
                        .map((n) => (
                          <option key={n.id} value={n.id}>
                            {String(n.data.label)}
                          </option>
                        ))}
                    </select>
                  </label>
                ),
              )}
            </div>
          )}
          <button
            className="aw-danger"
            onClick={() => {
              snapshot();
              setNodes((ns) => ns.filter((n) => n.id !== selected));
              setEdges((es) =>
                es.filter(
                  (e) => e.source !== selected && e.target !== selected,
                ),
              );
              setSelected(null);
              setPanel(null);
            }}
          >
            <Trash2 size={14} />
            Excluir bloco
          </button>
        </>
      ) : (
        !run && (
          <p>Selecione uma etapa na lista ou no canvas para configurar.</p>
        )
      )}
      {issues.length > 0 && (
        <>
          <h3 style={{ marginTop: 24 }}>Ajustes necessários</h3>
          <ul className="aw-error-list">
            {issues.map((i, index) => (
              <li key={index}>
                <button
                  style={{
                    border: 0,
                    padding: "6px 0",
                    background: "none",
                    color: "#fda4af",
                    textAlign: "left",
                  }}
                  onClick={() => {
                    if (i.nodeId) choose(i.nodeId);
                  }}
                >
                  {i.message}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      {run && (
        <>
          <h3 style={{ marginTop: 24 }}>Último teste</h3>
          <p>{labels[run.status] || run.status}</p>
          {run.steps?.map((s: Run["steps"][number]) => (
            <p key={s.id}>
              <small>
                {s.node_id}: {s.error_code || labels[s.status] || s.status}
              </small>
            </p>
          ))}
          {!catalog.workerEnabled && (
            <p>
              Worker desativado. O teste permanece na fila até a ativação
              aprovada.
            </p>
          )}
        </>
      )}
    </aside>
  );
  return (
    <div className={"aw-editor-screen" + (expanded ? " is-expanded" : "")} >
      {pendingStep && (
        <ModalFrame onClose={() => setPendingStep(null)}>
          <section className="aw-card aw-next-step" role="dialog" aria-modal="true" aria-labelledby="aw-next-step-title">
            <div className="aw-section-title">
              <h2 id="aw-next-step-title">Qual é a próxima etapa?</h2>
              <button type="button" aria-label="Cancelar próxima etapa" onClick={() => setPendingStep(null)}><X size={18} /></button>
            </div>
            <p>Escolha um bloco. Ele será criado onde você soltou a linha e conectado automaticamente{pendingStep.handle === "yes" ? " à saída Sim" : pendingStep.handle === "no" ? " à saída Não" : ""}.</p>
            {edges.some((edge) => edge.source === pendingStep.source && (edge.sourceHandle || null) === pendingStep.handle) && <p className="aw-notice">A conexão anterior desta saída será substituída. Você pode desfazer.</p>}
            <div className="aw-next-step-options">
              {Object.keys(blockIcons).filter((kind) => !["trigger", "note"].includes(kind)).map((kind) => {
                const Icon = blockIcons[kind];
                return <button type="button" key={kind} onClick={() => add(kind, true)}>
                  <Icon size={19} style={{ color: colors[kind] }} />{labels[kind]}
                </button>;
              })}
            </div>
          </section>
        </ModalFrame>
      )}
      <header className="aw-head aw-editor-head">
        <div className="aw-row aw-editor-identity">
          <Link className="aw-link" href="/automacoes" aria-label="Voltar">
            <ArrowLeft size={17} />
          </Link>
          <div>
            <h1>{flow.name}</h1>
            <small>
              <span className={"aw-badge " + flow.status}>
                {labels[flow.status]}
              </span>{" "}
              · Versão {flow.published_version || "não publicada"} ·{" "}
              {dirty ? "Alterações não salvas" : "Rascunho salvo"}
            </small>
          </div>
        </div>
        <button ref={expandButton} type="button" aria-pressed={expanded}
          onClick={() => setExpanded((value) => !value)}>
          {expanded ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
          {expanded ? "Sair da tela cheia" : "Tela cheia"}
        </button>
      </header>
      <div className="aw-editor-toolbar" aria-label="Ações do fluxo">
        <div className="aw-row">
          <button
            aria-label="Desfazer"
            title="Desfazer"
            disabled={!history.length || busy}
            onClick={undo}
          >
            <Undo2 size={16} />
          </button>
          <button
            aria-label="Refazer"
            title="Refazer"
            disabled={!future.length || busy}
            onClick={redo}
          >
            <Redo2 size={16} />
          </button>
          <button disabled={busy} onClick={() => void action("validate")}>
            <CheckCircle2 size={16} />
            Validar
          </button>
          <button
            disabled={busy || !flow.published_version}
            onClick={() => void action("test")}
          >
            <Play size={16} />
            Testar v{flow.published_version}
          </button>
          <button disabled={busy} onClick={() => void action("save")}>
            <Save size={16} />
            Salvar
          </button>
          <button
            className="primary"
            disabled={busy}
            onClick={() => setConfirm(true)}
          >
            <Upload size={16} />
            Publicar
          </button>
        </div>
        <span className="aw-toolbar-status">
          {nodes.length} blocos · {edges.length} conexões
        </span>
      </div>
      {error && <ErrorFeedback message={error} />}
      {notice && (
        <div className="aw-notice" role="status">
          {notice}
        </div>
      )}
      {!catalog.sendEnabled && (
        <div className="aw-notice">
          Envios reais desativados. Use “Testar” para simular a versão
          publicada.
        </div>
      )}
      {run && (
        <div className="aw-test-status" role="status">
          <div>
            <Play size={15} />
            <span>Última simulação</span>
            <span className={"aw-badge " + run.status}>
              {labels[run.status] || run.status}
            </span>
          </div>
          <button
            onClick={() => {
              setSelected(null);
              setPanel("inspector");
            }}
          >
            Ver resultado
          </button>
        </div>
      )}
      <details className="aw-editor-more">
        <summary>Mais opções do fluxo</summary>
        <div className="aw-row">
          <button
            onClick={async () => {
              try {
                const data = await w.get("/flows/" + id + "/export");
                const url = URL.createObjectURL(
                  new Blob([JSON.stringify(data, null, 2)], {
                    type: "application/json",
                  }),
                );
                const a = document.createElement("a");
                a.href = url;
                a.download = "trafficai-fluxo.json";
                a.click();
                URL.revokeObjectURL(url);
              } catch (e) {
                setError(String(e));
              }
            }}
          >
            Exportar JSON
          </button>
          <button
            onClick={async () => {
              try {
                const copy = await w.post<{ id: string }>(
                  "/flows/" + id + "/duplicate",
                );
                window.location.assign("/automacoes/fluxos/" + copy.id);
              } catch (e) {
                setError(String(e));
              }
            }}
          >
            Duplicar rascunho salvo
          </button>
        </div>
      </details>
      <div className="aw-workspace-bar">
        <div
          className="aw-view-toggle"
          role="group"
          aria-label="Visualização do fluxo"
        >
          <button
            aria-pressed={currentView === "steps"}
            onClick={() => setView("steps")}
          >
            <ListOrdered size={16} />
            Etapas
          </button>
          <button
            aria-pressed={currentView === "canvas"}
            onClick={() => setView("canvas")}
          >
            <Network size={16} />
            Canvas
          </button>
        </div>
        {currentView === "canvas" && (
          <button
            className="aw-desktop-fit"
            onClick={() =>
              void canvas.current?.fitView({
                padding: 0.25,
                minZoom: 0.65,
                maxZoom: 1,
                duration: 200,
              })
            }
          >
            Centralizar fluxo
          </button>
        )}
        <div className="aw-row aw-mobile-tools">
          <button
            onClick={() => {
              setPanel("library");
              setLibraryTab("blocks");
            }}
          >
            <Layers size={16} />
            Adicionar
          </button>
          <button
            aria-label="Ajustes do fluxo"
            onClick={() => {
              setPanel("library");
              setLibraryTab("settings");
            }}
          >
            <Settings2 size={16} />
          </button>
        </div>
      </div>
      <div className="aw-editor" data-view={currentView}>
        {isMobile
          ? panel === "library" && (
              <ModalFrame onClose={() => setPanel(null)}>
                {libraryPanel}
              </ModalFrame>
            )
          : libraryPanel}
        <section className="aw-step-list" aria-label="Etapas do fluxo">
          <div className="aw-step-heading">
            <h2>Jornada do contato</h2>
            <p>Toque em uma etapa para configurar seu conteúdo e conexões.</p>
          </div>
          {orderedNodes.map((node, index) => {
            const kind = String(node.data.kind),
              Icon = blockIcons[kind] || Layers,
              links = edges.filter((e) => e.source === node.id);
            return (
              <div key={node.id} className="aw-step-wrap">
                <button
                  className={
                    "aw-step-card " +
                    (selected === node.id ? "selected " : "") +
                    (invalidIds.has(node.id) ? "invalid" : "")
                  }
                  onClick={() => choose(node.id)}
                  aria-label={"Configurar " + String(node.data.label)}
                >
                  <span className="aw-step-number">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span
                    className="aw-step-icon"
                    style={{
                      color: colors[kind],
                      background: colors[kind] + "16",
                    }}
                  >
                    <Icon size={20} />
                  </span>
                  <span className="aw-step-copy">
                    <small>{labels[kind]}</small>
                    <strong>{String(node.data.label)}</strong>
                    {kind === "message" && <span>{messagePreview(node)}</span>}
                    {kind === "message" && <span><Clock3 size={13} /> {timingLabel(node.id)}</span>}
                    <span>
                      {String(
                        node.data.subtitle ||
                          (kind === "end"
                            ? "Encerra esta execução"
                            : "Configurar esta etapa"),
                      )}
                    </span>
                  </span>
                  <span className="aw-step-indicator">
                    {invalidIds.has(node.id) ? (
                      <AlertCircle size={18} />
                    ) : (
                      <ArrowRight size={18} />
                    )}
                  </span>
                </button>
                {links.length > 0 ? (
                  <div className="aw-step-connections">
                    {links.map((edge) => (
                      <span key={edge.id}>
                        {edge.sourceHandle === "yes"
                          ? "Sim → "
                          : edge.sourceHandle === "no"
                            ? "Não → "
                            : "Próxima: "}
                        {String(
                          nodes.find((n) => n.id === edge.target)?.data.label ||
                            "Etapa removida",
                        )}
                      </span>
                    ))}
                  </div>
                ) : (
                  !["end", "note"].includes(kind) && (
                    <div className="aw-step-connections aw-step-unlinked">
                      Escolha a próxima etapa
                    </div>
                  )
                )}
              </div>
            );
          })}
        </section>
        <section className="aw-canvas" aria-label="Canvas do fluxo">
          {currentView === "canvas" && (
            <ReactFlow<Node, Edge>
              nodes={nodes.map((n) => ({
                ...n,
                data: {
                  ...n.data,
                  messagePreview: n.data.kind === "message" ? messagePreview(n) : undefined,
                  timing: n.data.kind === "message" ? timingLabel(n.id) : undefined,
                  invalid: invalidIds.has(n.id),
                  state: runStates[n.id],
                },
              }))}
              edges={edges}
              nodeTypes={nodeTypes}
              onNodesChange={changeNodes}
              onEdgesChange={changeEdges}
              onConnect={connect}
              onConnectStart={() => setPendingStep(null)}
              onConnectEnd={finishConnection}
              onInit={(instance) => {
                canvas.current = instance;
              }}
              onNodeClick={(_, n) => choose(n.id)}
              onPaneClick={() => setSelected(null)}
              onNodeDragStart={() => snapshot()}
              onBeforeDelete={async () => {
                snapshot();
                return true;
              }}
              fitView
              fitViewOptions={{ padding: 0.25, minZoom: 0.65, maxZoom: 1 }}
              minZoom={0.3}
              maxZoom={2}
              colorMode="dark"
              deleteKeyCode={["Backspace", "Delete"]}
            >
              <Background gap={22} size={1} color="#323943" />
              <Controls
                fitViewOptions={{ padding: 0.25, minZoom: 0.65, maxZoom: 1 }}
              />
              <MiniMap
                nodeColor={(n) => colors[String(n.data.kind)] || "#999"}
                maskColor="#08090b99"
                style={{ background: "#16181b", height: 95, width: 150 }}
              />
            </ReactFlow>
          )}
        </section>
        {isMobile
          ? panel === "inspector" && (
              <ModalFrame onClose={() => setPanel(null)}>
                {inspectorPanel}
              </ModalFrame>
            )
          : inspectorPanel}
      </div>
      {leaveTo && (
        <ModalFrame busy={busy} onClose={() => setLeaveTo(null)}>
          <section
            className="aw-card"
            role="dialog"
            aria-modal="true"
            aria-label="Alterações não salvas"
          >
            <h2>Salvar antes de sair?</h2>
            <p>
              Você tem alterações no rascunho. Salve para continuar de onde
              parou.
            </p>
            <div className="aw-row">
              <button disabled={busy} onClick={() => setLeaveTo(null)}>
                Continuar editando
              </button>
              <button
                disabled={busy}
                onClick={() => {
                  setDirty(false);
                  setLeaveTo(null);
                  router.push(leaveTo);
                }}
              >
                Sair sem salvar
              </button>
              <button
                className="primary"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  setError("");
                  try {
                    await save();
                    setLeaveTo(null);
                    router.push(leaveTo);
                  } catch (e) {
                    setError(
                      e instanceof Error
                        ? e.message
                        : "Não foi possível salvar",
                    );
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {busy ? "Salvando…" : "Salvar e sair"}
              </button>
            </div>
            {error && <ErrorFeedback message={error} />}
          </section>
        </ModalFrame>
      )}
      {confirm && (
        <ModalFrame busy={busy} onClose={() => setConfirm(false)}>
          <section
            className="aw-card"
            role="dialog"
            aria-modal="true"
            aria-label="Publicar fluxo"
          >
            <h2>Publicar nova versão?</h2>
            <p>
              O rascunho será salvo, validado e se tornará a versão ativa para
              novos eventos. Execuções existentes continuam na versão em que
              começaram.
            </p>
            <p>
              {catalog.sendEnabled
                ? "Envios reais estão habilitados para ações elegíveis."
                : "Envios reais estão desativados neste ambiente."}
            </p>
            <div className="aw-row">
              <button onClick={() => setConfirm(false)}>Voltar</button>
              <button
                className="primary"
                disabled={busy}
                onClick={() => void action("publish")}
              >
                {busy ? "Validando…" : "Confirmar publicação"}
              </button>
            </div>
            {error && <p role="alert">{error}</p>}
          </section>
        </ModalFrame>
      )}
    </div>
  );
}
