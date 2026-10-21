"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Users, Mail, Send, RefreshCw } from "lucide-react";
import {
  workflows as w,
  labels,
  type Flow,
  type RecordRow,
  type Catalog,
} from "./api";
import ModalFrame from "./ModalFrame";
import { ErrorFeedback, LoadingState } from "./Feedback";
interface Segment {
  id: string;
  name: string;
  rules: { channel?: string; tag?: string; status?: string; search?: string };
}
interface Campaign {
  id: string;
  name: string;
  status: string;
  flow_name: string;
  recipients: number;
  skipped: number;
  failed_runs: number;
  channel: string;
  version: number;
}
interface Preview {
  channel?: string;
  senders?: { id: string; name: string; sender?: string; provider: string }[];
  count: number;
  capped: boolean;
  sample: {
    id: string;
    contact_name: string;
    contact_email?: string;
    contact_phone?: string;
  }[];
}
const InlineFrame = ({ children }: { children: React.ReactNode }) => (
  <div className="aw-email-builder">{children}</div>
);
export default function MarketingPanel({
  mode,
}: {
  mode: "segments" | "campaigns" | "email";
}) {
  const router = useRouter();
  const [segments, setSegments] = useState<Segment[]>([]),
    [campaigns, setCampaigns] = useState<Campaign[]>([]),
    [flows, setFlows] = useState<Flow[]>([]),
    [templates, setTemplates] = useState<RecordRow[]>([]),
    [catalog, setCatalog] = useState<Partial<Catalog>>({}),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [open, setOpen] = useState(mode === "email"),
    [preview, setPreview] = useState<Preview | null>(null),
    [selected, setSelected] = useState<Campaign | null>(null),
    [name, setName] = useState(""),
    [channel, setChannel] = useState("email"),
    [tag, setTag] = useState(""),
    [search, setSearch] = useState(""),
    [segmentId, setSegmentId] = useState(""),
    [flowId, setFlowId] = useState(""),
    [connection, setConnection] = useState(""),
    [first, setFirst] = useState(""),
    [second, setSecond] = useState(""),
    [hours, setHours] = useState(24),
    [limit, setLimit] = useState(100),
    [when, setWhen] = useState(""),
    [preset, setPreset] = useState("manual"),
    [product, setProduct] = useState(""),
    [products, setProducts] = useState<RecordRow[]>([]);
  async function load() {
    setLoading(true);
    setError("");
    try {
      const [s, c, f, t, cat, p] = await Promise.all([
        w.get<Segment[]>("/segments"),
        w.get<Campaign[]>("/campaigns"),
        w.get<Flow[]>("/flows"),
        w.get<RecordRow[]>("/templates"),
        w.get<Catalog>("/catalog"),
        w.get<RecordRow[]>("/products"),
      ]);
      setSegments(s);
      setCampaigns(c);
      setFlows(f);
      setTemplates(t);
      setCatalog(cat);
      setProducts(p);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  async function action(fn: () => Promise<void>) {
    setError("");
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  const Frame = mode === "email" ? InlineFrame : ModalFrame;
  const rules = { channel, tag: tag || null, search };
  async function create() {
    if (mode === "segments") {
      await w.post("/segments", { name, rules });
      setOpen(false);
      setPreview(null);
      await load();
    } else if (mode === "campaigns") {
      await w.post("/campaigns", {
        name,
        flow_id: flowId,
        segment_id: segmentId,
        max_recipients: limit,
      });
      setOpen(false);
      setPreview(null);
      await load();
    } else {
      const nodes = [
        {
          id: "start",
          type: "trigger",
          position: { x: 30, y: 120 },
          data: {
            label:
              preset === "manual"
                ? "Inscrição no funil"
                : preset === "checkout.started"
                  ? "Pedido criado / Pix pendente"
                  : "Pagamento aprovado",
            config: { event: preset },
          },
        },
        {
          id: "email1",
          type: "message",
          position: { x: 300, y: 120 },
          data: {
            label: "Primeiro e-mail",
            config: {
              channel: "email",
              templateId: first,
              integrationId: connection,
            },
          },
        },
        {
          id: "wait",
          type: "wait",
          position: { x: 570, y: 120 },
          data: {
            label: "Aguardar " + hours + " horas",
            config: { seconds: Math.round(hours * 3600) },
          },
        },
        {
          id: "email2",
          type: "message",
          position: { x: 840, y: 120 },
          data: {
            label: "Segundo e-mail",
            config: {
              channel: "email",
              templateId: second,
              integrationId: connection,
            },
          },
        },
        {
          id: "end",
          type: "end",
          position: { x: 1110, y: 120 },
          data: { label: "Encerrar sequência", config: {} },
        },
      ];
      if (preset === "checkout.started")
        nodes.splice(1, 0, {
          id: "initial_wait",
          type: "wait",
          position: { x: 165, y: 350 },
          data: {
            label: "Aguardar 30 minutos antes da recuperação",
            config: { seconds: 1800 },
          },
        });
      const edges = nodes
        .slice(1)
        .map((n, i) => ({ id: "e" + i, source: nodes[i].id, target: n.id }));
      const flow = await w.post<{ id: string }>("/flows", {
        name,
        product_id: product || null,
        recovery: preset === "checkout.started",
        settings: { stop_on_purchase: preset === "manual" && !!product },
        graph: { schemaVersion: 1, nodes, edges },
      });
      router.push("/automacoes/fluxos/" + flow.id);
    }
  }
  if (loading)
    return <LoadingState label="Preparando sua área de relacionamento…" />;
  return (
    <>
      <header className="aw-head aw-marketing-head">
        <div>
          <h1>
            {mode === "segments"
              ? "Segmentos de contatos"
              : mode === "campaigns"
                ? "Campanhas"
                : "Funil de e-mail"}
          </h1>
          <p>
            {mode === "email"
              ? "Transforme boas-vindas, recuperação e pós-compra em uma jornada."
              : "Audiência e execução conectadas ao CRM e à fila de automações."}
          </p>
        </div>
        <Link href="/automacoes" className="aw-link">
          Voltar à central
        </Link>
      </header>
      {error && !open && (
        <ErrorFeedback message={error} retry={() => void load()} />
      )}
      {!catalog.sendEnabled && (
        <div className="aw-notice">
          Envios reais desativados. Configure e teste seus fluxos antes de
          agendar uma campanha real.
        </div>
      )}
      {mode !== "email" && (
        <div className="aw-section-title">
          <h2>
            {mode === "segments"
              ? "Contatos do CRM, sem duplicação"
              : "Versão e destinatários congelados na confirmação"}
          </h2>
          <div className="aw-row">
            <button onClick={() => void load()}>
              <RefreshCw size={15} />
            </button>
            <button
              className="primary"
              onClick={() => {
                setOpen(true);
                setPreview(null);
                setSelected(null);
                setName("");
              }}
            >
              <Plus size={15} />
              Criar
            </button>
          </div>
        </div>
      )}
      {mode === "segments" && (
        <div className="aw-card aw-table">
          {segments.length ? (
            <table className="aw-compact-table">
              <thead>
                <tr>
                  <th>Segmento</th>
                  <th>Canal</th>
                  <th>Tag</th>
                  <th>Audiência</th>
                </tr>
              </thead>
              <tbody>
                {segments.map((s) => (
                  <tr key={s.id}>
                    <td>{s.name}</td>
                    <td>{labels[s.rules.channel || ""] || "Todos"}</td>
                    <td>{s.rules.tag || "—"}</td>
                    <td>
                      <button
                        onClick={() =>
                          void action(async () =>
                            setPreview(
                              await w.post<Preview>("/segments/preview", {
                                rules: s.rules,
                              }),
                            ),
                          )
                        }
                      >
                        Ver prévia
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="aw-empty">
              <Users />
              <h3>Defina sua primeira audiência</h3>
              <p>
                Filtre por canal autorizado, tag e nome ou e-mail do contato.
              </p>
            </div>
          )}
        </div>
      )}
      {mode === "campaigns" && (
        <div className="aw-card aw-table">
          {campaigns.length ? (
            <table className="aw-compact-table">
              <thead>
                <tr>
                  <th>Campanha</th>
                  <th>Fluxo</th>
                  <th>Estado</th>
                  <th>Destinatários</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((c) => (
                  <tr key={c.id}>
                    <td>{c.name}</td>
                    <td>
                      {c.flow_name} · v{c.version}
                    </td>
                    <td>
                      <span className={"aw-badge " + c.status}>
                        {labels[c.status] || c.status}
                      </span>
                    </td>
                    <td>
                      {c.recipients} · {c.skipped} ignorados ·{" "}
                      {c.failed_runs || 0} com falha
                    </td>
                    <td>
                      <div className="aw-row">
                        {c.status === "draft" ? (
                          <button
                            onClick={() =>
                              void action(async () => {
                                setSelected(c);
                                setPreview(
                                  await w.get<Preview>(
                                    "/campaigns/" + c.id + "/preview",
                                  ),
                                );
                              })
                            }
                          >
                            Revisar audiência
                          </button>
                        ) : (
                          !["completed", "canceled"].includes(c.status) && (
                            <>
                              <button
                                onClick={() =>
                                  void action(async () => {
                                    await w.post(
                                      "/campaigns/" + c.id + "/status",
                                      {
                                        status:
                                          c.status === "paused"
                                            ? "sending"
                                            : "paused",
                                      },
                                    );
                                    await load();
                                  })
                                }
                              >
                                {c.status === "paused" ? "Retomar" : "Pausar"}
                              </button>
                              <button
                                onClick={() =>
                                  void action(async () => {
                                    await w.post(
                                      "/campaigns/" + c.id + "/status",
                                      { status: "canceled" },
                                    );
                                    await load();
                                  })
                                }
                              >
                                Cancelar
                              </button>
                            </>
                          )
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="aw-empty">
              <Send />
              <h3>Nenhuma campanha criada</h3>
              <p>Crie primeiro um segmento e um fluxo manual publicado.</p>
            </div>
          )}
        </div>
      )}
      {preview && !open && (
        <section className="aw-card" style={{ marginTop: 20 }}>
          <div className="aw-section-title">
            <h2>
              Prévia: {preview.count} contatos{" "}
              {preview.capped ? "(limitado)" : ""}
            </h2>
            <button
              onClick={() => {
                setPreview(null);
                setSelected(null);
              }}
            >
              Fechar
            </button>
          </div>
          <p>
            O envio revalida consentimento e supressões. Contatos repetidos no
            mesmo funil não são inscritos novamente.
          </p>
          <table className="aw-compact-table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Contato</th>
              </tr>
            </thead>
            <tbody>
              {preview.sample.map((d) => (
                <tr key={d.id}>
                  <td>{d.contact_name}</td>
                  <td>{d.contact_email || d.contact_phone || "Sem destino"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {selected && (
            <p>
              Canal:{" "}
              {labels[preview.channel || selected.channel] || selected.channel}.
              Conexões:{" "}
              {preview.senders
                ?.map(
                  (s) =>
                    s.name +
                    (s.sender ? " — " + s.sender : "") +
                    " (" +
                    s.provider +
                    ")",
                )
                .join(", ") || "Confira a configuração do fluxo"}
              .
            </p>
          )}
          {selected && (
            <>
              <label>
                Agendar (horário local; vazio inicia quando o worker processar)
                <input
                  type="datetime-local"
                  value={when}
                  onChange={(e) => setWhen(e.target.value)}
                />
              </label>
              <p>
                Confirmar agenda o fluxo <strong>{selected.flow_name}</strong>,
                versão {selected.version}, para até {preview.count} contatos. As
                ações desse fluxo poderão enviar mensagens e alterar o CRM.
              </p>
              <button
                className="primary"
                disabled={busy || !preview.count}
                onClick={() =>
                  void action(async () => {
                    await w.post("/campaigns/" + selected.id + "/confirm", {
                      confirm: true,
                      expected_count: preview.count,
                      scheduled_at: when
                        ? new Date(when).toISOString()
                        : undefined,
                    });
                    setSelected(null);
                    setPreview(null);
                    await load();
                  })
                }
              >
                Confirmar agendamento de {preview.count} contatos
              </button>
            </>
          )}
        </section>
      )}
      {open && (
        <Frame busy={busy} onClose={() => setOpen(false)}>
          <section
            className={mode === "email" ? "aw-card aw-email-form" : "aw-card"}
            role={mode === "email" ? undefined : "dialog"}
            aria-modal={mode === "email" ? undefined : true}
          >
            <div className="aw-section-title">
              <h2>
                {mode === "email"
                  ? "Sequência inicial de dois e-mails"
                  : "Criar " + (mode === "segments" ? "segmento" : "campanha")}
              </h2>
              {mode !== "email" && (
                <button disabled={busy} onClick={() => setOpen(false)}>
                  Fechar
                </button>
              )}
            </div>
            <label>
              Nome
              <input value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            {mode === "segments" && (
              <>
                <label>
                  Canal autorizado
                  <select
                    value={channel}
                    onChange={(e) => setChannel(e.target.value)}
                  >
                    {["email", "whatsapp", "sms"].map((c) => (
                      <option key={c} value={c}>
                        {labels[c]}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Tag exata (opcional)
                  <input value={tag} onChange={(e) => setTag(e.target.value)} />
                </label>
                <label>
                  Nome ou e-mail contém
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </label>
                <button
                  disabled={busy}
                  onClick={() =>
                    void action(async () =>
                      setPreview(
                        await w.post<Preview>("/segments/preview", { rules }),
                      ),
                    )
                  }
                >
                  Calcular audiência
                </button>
                {preview && (
                  <div role="status" className="aw-notice">
                    Prévia: {preview.count} contatos autorizados{" "}
                    {preview.capped ? "(limite atingido)" : ""}.{" "}
                    {preview.sample
                      .slice(0, 3)
                      .map((d) => d.contact_name)
                      .join(", ")}
                  </div>
                )}
              </>
            )}
            {mode === "campaigns" && (
              <>
                <label>
                  Segmento
                  <select
                    value={segmentId}
                    onChange={(e) => setSegmentId(e.target.value)}
                  >
                    <option value="">Selecionar</option>
                    {segments.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Fluxo manual publicado
                  <select
                    value={flowId}
                    onChange={(e) => setFlowId(e.target.value)}
                  >
                    <option value="">Selecionar</option>
                    {flows
                      .filter((f) => f.published_version)
                      .map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.name}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  Máximo de destinatários
                  <input
                    type="number"
                    min={1}
                    max={10000}
                    value={limit}
                    onChange={(e) => setLimit(Number(e.target.value))}
                  />
                </label>
              </>
            )}
            {mode === "email" && (
              <>
                <div className="aw-wizard-intro">
                  <span className="aw-wizard-icon">
                    <Mail size={23} />
                  </span>
                  <div>
                    <h3>Uma sequência que acompanha cada contato</h3>
                    <p>
                      Escolha o objetivo, o remetente e os conteúdos. Você
                      poderá ajustar tudo no editor.
                    </p>
                  </div>
                </div>
                <label>
                  Objetivo da sequência
                  <select
                    value={preset}
                    onChange={(e) => setPreset(e.target.value)}
                  >
                    <option value="manual">
                      Boas-vindas / nutrição por inscrição
                    </option>
                    <option value="checkout.started">
                      Recuperação de pedido / Pix pendente
                    </option>
                    <option value="payment.approved">
                      Pós-compra / entrega
                    </option>
                  </select>
                </label>
                <label>
                  Produto
                  <select
                    value={product}
                    onChange={(e) => setProduct(e.target.value)}
                  >
                    <option value="">Selecionar produto</option>
                    {products
                      .filter((p) => p.active !== false)
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                  </select>
                </label>
                {preset === "checkout.started" && (
                  <p>
                    A sequência só envia enquanto o pedido estiver pendente e é
                    cancelada quando a compra correspondente for aprovada.
                  </p>
                )}
                <label>
                  Remetente / conexão Resend
                  <select
                    value={connection}
                    onChange={(e) => setConnection(e.target.value)}
                  >
                    <option value="">Selecionar</option>
                    {catalog.integrations
                      ?.filter((i) => i.provider === "resend")
                      .map((i) => (
                        <option key={i.id} value={i.id}>
                          {i.name}
                        </option>
                      ))}
                  </select>
                </label>
                {[
                  { label: "Primeiro e-mail", value: first, change: setFirst },
                  { label: "Segundo e-mail", value: second, change: setSecond },
                ].map((f) => (
                  <label key={f.label}>
                    {f.label}
                    <select
                      value={f.value}
                      onChange={(e) => f.change(e.target.value)}
                    >
                      <option value="">Selecionar modelo</option>
                      {templates
                        .filter((t) => t.channel === "email")
                        .map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                    </select>
                  </label>
                ))}
                <label>
                  Espera entre os e-mails (horas)
                  <input
                    type="number"
                    min={1}
                    max={720}
                    value={hours}
                    onChange={(e) => setHours(Number(e.target.value))}
                  />
                </label>
                <p>
                  Crie modelos e cadastre seu remetente em Modelos/Canais na
                  central. Depois de criar, você poderá acrescentar condições e
                  mais mensagens no canvas.
                </p>
              </>
            )}
            {error && <ErrorFeedback message={error} />}
            {mode === "email" &&
              (!templates.some((t) => t.channel === "email") ||
                !catalog.integrations?.some(
                  (i) => i.provider === "resend",
                )) && (
                <div className="aw-notice">
                  <strong>Prepare o envio antes de criar a sequência</strong>
                  <p>
                    Cadastre um remetente e pelo menos dois modelos de e-mail.
                  </p>
                  <div className="aw-row">
                    <Link
                      className="aw-link"
                      href="/automacoes?tab=integrations"
                    >
                      Configurar remetente
                    </Link>
                    <Link className="aw-link" href="/automacoes?tab=templates">
                      Criar modelos
                    </Link>
                  </div>
                </div>
              )}
            <button
              className="primary"
              disabled={
                busy ||
                !name ||
                (mode === "email" &&
                  ((preset !== "manual" && !product) ||
                    !connection ||
                    !first ||
                    !second ||
                    hours < 1 ||
                    hours > 720))
              }
              onClick={() => void action(create)}
            >
              {busy
                ? "Salvando…"
                : mode === "email"
                  ? "Criar e abrir editor"
                  : "Salvar rascunho"}
            </button>
          </section>
        </Frame>
      )}
    </>
  );
}
