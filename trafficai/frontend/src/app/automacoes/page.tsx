"use client";
import OfferFields from "@/components/automations/OfferFields";
import TemplateDesigner from "@/components/automations/TemplateDesigner";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Zap,
  Plus,
  GitBranch,
  Activity,
  Send,
  Users,
  RefreshCw,
  ArrowUpRight,
  Package,
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";
import {
  workflows as w,
  labels,
  initialGraph,
  type RecordRow,
  type FormValues,
  type Catalog,
  type Overview,
  type Flow,
} from "@/components/automations/api";
import ModalFrame from "@/components/automations/ModalFrame";
import { ErrorFeedback, LoadingState } from "@/components/automations/Feedback";
type Row = RecordRow;
const tabs = [
  ["overview", "Visão geral"],
  ["flows", "Fluxos"],
  ["products", "Produtos e ofertas"],
  ["templates", "Modelos"],
  ["contacts", "Contatos"],
  ["runs", "Execuções"],
  ["integrations", "Canais"],
];
export default function Automations() {
  return (
    <Suspense fallback={<LoadingState />}>
      <AutomationCenter />
    </Suspense>
  );
}
function AutomationCenter() {
  const router = useRouter(),
    params = useSearchParams();
  const requested = params.get("tab") || "overview",
    tab = tabs.some(([key]) => key === requested) ? requested : "overview";
  const setTab = (key: string) =>
    router.push(key === "overview" ? "/automacoes" : "/automacoes?tab=" + key);
  const folder = ["mine", "templates", "all"].includes(params.get("folder") || "") ? params.get("folder")! : "mine";
  const latestRequest = useRef(0);
  const [rows, setRows] = useState<Row[]>([]),
    [summary, setSummary] = useState<Record<string, number | null>>({}),
    [daily, setDaily] = useState<Overview["daily"]>([]),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [loadedTab, setLoadedTab] = useState(""),
    [busy, setBusy] = useState(false),
    [modal, setModal] = useState(""),
    [detail, setDetail] = useState<Row | null>(null),
    [catalog, setCatalog] = useState<Partial<Catalog>>({}),
    [search, setSearch] = useState(""),
    [period, setPeriod] = useState(30),
    [form, setForm] = useState<FormValues>({}),
    [enrollFlow, setEnrollFlow] = useState(""),
    [allowReentry, setAllowReentry] = useState(false),
    [flowOptions, setFlowOptions] = useState<Flow[]>([]);
  const invalidateRequest = useCallback(() => {
    latestRequest.current += 1;
  }, []);
  const load = useCallback(async () => {
    const request = ++latestRequest.current;
    setLoading(true);
    setError("");
    try {
      if (tab === "overview") {
        const data = await w.get<Overview>(
          "/overview?since=" +
            new Date(Date.now() - period * 864e5).toISOString().slice(0, 10),
        );
        if (request !== latestRequest.current) return;
        setSummary(data.summary);
        setDaily(data.daily);
      } else {
        const result = await w.get<Row[]>(
          "/" +
            tab +
            (tab === "contacts" ? "?search=" + encodeURIComponent(search) : tab === "flows" ? "?folder=" + folder : ""),
        );
        if (request === latestRequest.current) setRows(result);
      }
    } catch (e) {
      if (request === latestRequest.current)
        setError(e instanceof Error ? e.message : "Falha ao carregar");
    } finally {
      if (request === latestRequest.current) {
        setLoading(false);
        setLoadedTab(tab);
      }
    }
  }, [tab, search, period, folder]);
  useEffect(() => {
    const timer = setTimeout(() => void load(), tab === "contacts" ? 250 : 0);
    return () => {
      clearTimeout(timer);
      invalidateRequest();
    };
  }, [load, tab, invalidateRequest]);
  useEffect(() => {
    w.get<Catalog>("/catalog")
      .then(setCatalog)
      .catch(() => {});
  }, []);
  async function create() {
    setBusy(true);
    setError("");
    try {
      if (modal === "import") {
        const f = await w.post<{ id: string }>(
          "/flows/import",
          JSON.parse(form.body || ""),
        );
        router.push("/automacoes/fluxos/" + f.id);
        return;
      }
      if (modal === "enroll") {
        const result = await w.post<{ skipped?: string }>(
          "/flows/" + enrollFlow + "/enroll",
          { deal_id: detail?.id, confirm: true, allow_reentry: allowReentry },
        );
        if (result.skipped)
          throw Error(
            result.skipped === "already_enrolled"
              ? "Este contato já está inscrito no fluxo."
              : "Contato sem destino ou consentimento elegível.",
          );
        setModal("");
        setDetail(null);
        await load();
        return;
      }
      if (modal === "flows") {
        const f = await w.post<{ id: string }>("/flows", {
          name: form.name,
          graph: initialGraph,
        });
        router.push("/automacoes/fluxos/" + f.id);
      } else {
        await (form.id ? w.put : w.post)(
          "/" + modal + (form.id ? "/" + form.id : ""),
          modal === "templates"
            ? {
                ...form,
                channel: form.channel || "email",
                purpose: form.purpose || "transactional",
              }
            : form,
        );
        setModal("");
        setForm({});
        await load();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao salvar");
    } finally {
      setBusy(false);
    }
  }
  const createSection = ["overview", "flows"].includes(tab)
    ? "flows"
    : ["products", "templates", "integrations"].includes(tab)
      ? tab
      : null;
  const createLabel = (
    {
      flows: "Novo fluxo",
      products: "Novo produto",
      templates: "Novo modelo",
      integrations: "Novo canal",
    } as Record<string, string>
  )[createSection || ""];
  const descriptions: Record<string, string> = {
    overview: "Conecte eventos, relacionamento e vendas em um só fluxo.",
    flows: "Desenhe jornadas, revise cada etapa e acompanhe a execução.",
    products: "Organize os produtos e as ofertas usados nas suas automações.",
    templates:
      "Prepare mensagens que podem ser reutilizadas em diferentes jornadas.",
    contacts: "Seus contatos do CRM e suas permissões para receber mensagens.",
    runs: "Acompanhe etapas, esperas e resultados de cada execução.",
    integrations:
      "Configure os canais e escolha de onde sairão suas mensagens.",
  };
  const kpis = [
    ["Fluxos ativos", summary.active_flows, GitBranch],
    ["Execuções", summary.executions, Activity],
    ["Mensagens enviadas", summary.messages_sent, Send],
    ["Contatos alcançados", summary.contacts, Users],
  ] as const;
  return (
    <>
      <header className="aw-head aw-center-head">
        <div>
          <div className="aw-row">
            <Zap size={24} color="#38bdf8" />
            <h1>{tabs.find(([key]) => key === tab)?.[1] || "Automações"}</h1>
          </div>
          <p>{descriptions[tab]}</p>
        </div>
        <div className="aw-row">
          {tab === "overview" && (
            <Link className="aw-link" href="/automation">
              Regras de mídia <ArrowUpRight size={14} />
            </Link>
          )}
          {createSection && (
            <button
              className="primary"
              onClick={() => {
                setForm({});
                setModal(createSection);
              }}
            >
              <Plus size={16} />
              {createLabel}
            </button>
          )}
        </div>
      </header>
      {["overview", "flows"].includes(tab) && (
        <button
          className="aw-import-button"
          onClick={() => {
            setForm({});
            setModal("import");
          }}
          style={{ marginBottom: 12 }}
        >
          Importar fluxo JSON
        </button>
      )}
      {error && !modal && (
        <ErrorFeedback message={error} retry={() => void load()} />
      )}
      {!catalog.sendEnabled && (
        <div className="aw-notice">
          Envios reais desativados. Os testes simulam ações sem enviar mensagens
          ou alterar o CRM.
        </div>
      )}
      {loading || loadedTab !== tab ? (
        <LoadingState />
      ) : error ? null : tab === "overview" ? (
        <>
          <div className="aw-section-title">
            <h2>Operação</h2>
            <select
              aria-label="Período dos indicadores"
              style={{ width: 170 }}
              value={period}
              onChange={(e) => setPeriod(Number(e.target.value))}
            >
              <option value={7}>Últimos 7 dias</option>
              <option value={30}>Últimos 30 dias</option>
              <option value={90}>Últimos 90 dias</option>
            </select>
          </div>
          <div className="aw-grid">
            {kpis.map(([name, value, Icon]) => (
              <div className="aw-card aw-kpi" key={name}>
                <Icon size={19} />
                <strong>{value ?? "—"}</strong>
                <span>{name}</span>
              </div>
            ))}
          </div>
          {summary.active_flows === 0 && summary.executions === 0 && (
            <div className="aw-onboarding">
              <div>
                <small>COMECE POR AQUI</small>
                <h2>Sua primeira jornada em três passos</h2>
              </div>
              <div className="aw-onboarding-links">
                <Link href="/automacoes?tab=integrations">
                  <span>01</span>
                  <div>
                    <strong>Conecte um canal</strong>
                    <small>WhatsApp, e-mail ou SMS</small>
                  </div>
                  <ArrowUpRight size={16} />
                </Link>
                <Link href="/automacoes?tab=templates">
                  <span>02</span>
                  <div>
                    <strong>Prepare a mensagem</strong>
                    <small>Conteúdo e personalização</small>
                  </div>
                  <ArrowUpRight size={16} />
                </Link>
                <Link href="/automacoes?tab=flows">
                  <span>03</span>
                  <div>
                    <strong>Monte o fluxo</strong>
                    <small>Valide antes de publicar</small>
                  </div>
                  <ArrowUpRight size={16} />
                </Link>
              </div>
            </div>
          )}
          <div className="aw-card">
            <div className="aw-section-title">
              <h2>Execuções ao longo do tempo</h2>
              <span className="aw-badge">Somente execuções reais</span>
            </div>
            {daily.length ? (
              <div className="aw-chart">
                <ResponsiveContainer>
                  <AreaChart data={daily}>
                    <CartesianGrid stroke="#ffffff0b" vertical={false} />
                    <XAxis
                      dataKey="day"
                      tickFormatter={(d) =>
                        new Date(d).toLocaleDateString("pt-BR", {
                          day: "2-digit",
                          month: "2-digit",
                        })
                      }
                      stroke="#7a8290"
                      fontSize={11}
                    />
                    <YAxis
                      allowDecimals={false}
                      stroke="#7a8290"
                      fontSize={11}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "#1d2025",
                        border: "1px solid #333",
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="executions"
                      name="Execuções"
                      stroke="#38bdf8"
                      fill="#0ea5e922"
                    />
                    <Area
                      type="monotone"
                      dataKey="completed"
                      name="Concluídas"
                      stroke="#34d399"
                      fill="transparent"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="aw-empty">
                <Activity color="#38bdf8" />
                <h3>A operação começa com seu primeiro fluxo</h3>
                <p>
                  Quando houver execuções reais, os indicadores aparecerão aqui.
                </p>
                <button onClick={() => setTab("flows")}>
                  Configurar fluxos
                </button>
              </div>
            )}
          </div>
          <div className="aw-grid" style={{ marginTop: 18 }}>
            <div className="aw-card">
              <small>Concluídas</small>
              <h2>{summary.completed ?? "—"}</h2>
            </div>
            <div className="aw-card">
              <small>Falhas</small>
              <h2>{summary.failed ?? "—"}</h2>
            </div>
            <div className="aw-card">
              <small>Entrega confirmada</small>
              <h2>{summary.messages_delivered ?? "—"}</h2>
              <small>Exige confirmação do provedor</small>
            </div>
            <div className="aw-card">
              <small>Compras atribuídas</small>
              <h2>{summary.attributed_purchases ?? "—"}</h2>
              <small>Somente vínculos verificados</small>
            </div>
          </div>
        </>
      ) : (
        <>
          {tab === "flows" && <div className="aw-card" style={{ marginBottom: 18 }}>
            <div className="aw-row" role="group" aria-label="Pastas de fluxos">
              {[["mine", "Meus fluxos"], ["templates", "📁 Templates"], ["all", "Todos"]].map(([key, label]) =>
                <button type="button" key={key} aria-pressed={folder === key} className={folder === key ? "primary" : ""}
                  onClick={() => router.push("/automacoes?tab=flows&folder=" + key)}>{label}</button>)}
            </div>
            {folder === "templates" && <p style={{ marginBottom: 0 }}>Modelos padrão para duplicar. As cópias ficam em Meus fluxos, com mensagens independentes para adaptar por produto.</p>}
          </div>}
          <div className="aw-section-title">
            <h2>
              {tabs.find((t) => t[0] === tab)?.[1]}{" "}
              <span className="aw-badge">{rows.length}</span>
            </h2>
            <div className="aw-row">
              {tab === "contacts" && (
                <label style={{ margin: 0 }}>
                  <input
                    aria-label="Buscar contato"
                    placeholder="Buscar no CRM"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </label>
              )}
              <button aria-label="Atualizar" onClick={() => void load()}>
                <RefreshCw size={15} />
              </button>
            </div>
          </div>
          {!rows.length ? (
            <div className="aw-card aw-empty">
              {tab === "products" ? (
                <Package size={28} />
              ) : (
                <GitBranch size={28} />
              )}
              <h3>
                {tab === "flows" && folder === "templates" ? "Nenhum template nesta pasta" : tab === "contacts"
                  ? "Nenhum contato encontrado"
                  : "Tudo pronto para começar"}
              </h3>
              <p>
                {tab === "contacts"
                  ? "Os contatos são os mesmos do seu CRM, sem duplicação."
                  : tab === "runs"
                    ? "As execuções e os testes aparecerão aqui."
                    : "Crie seu primeiro registro para configurar a automação."}
              </p>
            </div>
          ) : (
            <div className="aw-card aw-table aw-records-table">
              <table>
                <thead>
                  <tr>
                    <th>{tab === "runs" ? "Fluxo" : "Nome"}</th>
                    <th>
                      {tab === "products"
                        ? "Valor"
                        : tab === "templates"
                          ? "Canal"
                          : "Estado"}
                    </th>
                    <th>
                      {tab === "contacts"
                        ? "E-mail / telefone"
                        : tab === "runs"
                          ? "Criado em"
                          : "Detalhes"}
                    </th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td data-label={tab === "runs" ? "Fluxo" : "Nome"}>
                        {r.name || r.flow_name || r.contact_name || "Sem nome"}
                        {r.test_mode && <span className="aw-badge">Teste</span>}
                      </td>
                      <td
                        data-label={
                          tab === "products"
                            ? "Valor"
                            : tab === "templates"
                              ? "Canal"
                              : "Estado"
                        }
                      >
                        {tab === "products" ? (
                          new Intl.NumberFormat("pt-BR", {
                            style: "currency",
                            currency: r.currency || "BRL",
                          }).format(r.price || 0)
                        ) : (
                          <span className={"aw-badge " + r.status}>
                            {labels[
                              r.status || r.channel || r.provider || ""
                            ] ||
                              r.status ||
                              r.channel ||
                              r.provider}
                          </span>
                        )}
                      </td>
                      <td
                        data-label={
                          tab === "contacts"
                            ? "Contato"
                            : tab === "runs"
                              ? "Criado em"
                              : "Detalhes"
                        }
                      >
                        {tab === "contacts"
                          ? r.contact_email || r.contact_phone
                          : tab === "flows"
                            ? "Versão " +
                              (r.published_version || "não publicada")
                            : tab === "runs"
                              ? new Date(r.created_at || "").toLocaleString(
                                  "pt-BR",
                                )
                              : tab === "products"
                                ? r.external_product_id || "Sem vínculo externo"
                                : tab === "integrations"
                                  ? r.provider
                                  : r.purpose === "transactional"
                                    ? "Transacional"
                                    : "Marketing"}
                      </td>
                      <td data-label="Ações" className="aw-record-actions">
                        {tab === "flows" ? (
                          <div className="aw-row">
                            <Link
                              className="aw-link"
                              href={"/automacoes/fluxos/" + r.id}
                            >
                              Abrir editor
                            </Link>
                            {folder === "templates" && <button className="primary" disabled={busy} onClick={async () => {
                              setBusy(true); setError("");
                              try {
                                const copy = await w.post<{id: string}>("/flows/" + r.id + "/duplicate");
                                router.push("/automacoes/fluxos/" + copy.id);
                              } catch (e) { setError(e instanceof Error ? e.message : "Falha ao copiar template"); }
                              finally { setBusy(false); }
                            }}>Usar template</button>}
                            {r.published_version && (
                              <button
                                onClick={async () => {
                                  try {
                                    await w.post("/flows/" + r.id + "/status", {
                                      status:
                                        r.status === "active"
                                          ? "paused"
                                          : "active",
                                    });
                                    await load();
                                  } catch (e) {
                                    setError(String(e));
                                  }
                                }}
                              >
                                {r.status === "active" ? "Pausar" : "Ativar"}
                              </button>
                            )}
                          </div>
                        ) : tab === "runs" ? (
                          <button
                            onClick={async () => {
                              try {
                                setDetail(await w.get<Row>("/runs/" + r.id));
                              } catch (e) {
                                setError(String(e));
                              }
                            }}
                          >
                            Ver execução
                          </button>
                        ) : tab === "contacts" ? (
                          <div className="aw-row">
                            <button
                              onClick={async () => {
                                setDetail(r);
                                setEnrollFlow("");
                                setAllowReentry(false);
                                setModal("enroll");
                                try {
                                  setFlowOptions(await w.get<Flow[]>("/flows"));
                                } catch (e) {
                                  setError(String(e));
                                }
                              }}
                            >
                              Inscrever em funil
                            </button>
                            <button
                              onClick={() => {
                                setDetail(r);
                                setModal("consent");
                                setForm({
                                  channel: "email",
                                  status: "opted_out",
                                });
                              }}
                            >
                              Consentimento
                            </button>
                          </div>
                        ) : (
                          <div className="aw-row">
                            {tab === "integrations" &&
                              r.provider === "resend" && (
                                <button
                                  onClick={async () => {
                                    try {
                                      const result = await w.post<{
                                        verified: boolean;
                                      }>("/integrations/" + r.id + "/verify");
                                      await load();
                                      if (!result.verified)
                                        setError(
                                          "Domínio ainda não verificado no Resend.",
                                        );
                                    } catch (e) {
                                      setError(String(e));
                                    }
                                  }}
                                >
                                  Verificar remetente
                                </button>
                              )}
                            {["templates", "products", "integrations"].includes(
                              tab,
                            ) &&
                              !(
                                tab === "integrations" &&
                                r.provider?.startsWith("whatsapp")
                              ) && (
                                <button
                                  onClick={() => {
                                    setForm({
                                      ...r,
                                      price:
                                        r.price == null
                                          ? undefined
                                          : String(r.price),
                                      name: r.name,
                                      body: r.body,
                                      subject: r.subject,
                                      purpose: r.purpose,
                                      channel: r.channel,
                                    });
                                    setModal(tab);
                                  }}
                                >
                                  Editar
                                </button>
                              )}
                            {tab === "templates" && <button onClick={() => {
                              setError("");
                              setForm({ ...r, id: undefined, name: ((r.name || "Modelo") + " (cópia)").slice(0,160), price: r.price == null ? undefined : String(r.price) });
                              setModal("templates");
                            }}>Duplicar</button>}
                            <button onClick={() => setDetail(r)}>
                              Detalhes
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
      {modal && (
        <ModalFrame
          busy={busy}
          onClose={() => {
            setModal("");
            setForm({});
          }}
        >
          <section
            className="aw-card"
            role="dialog"
            aria-modal="true"
            aria-label="Criar registro"
          >
            <div className="aw-section-title">
              <h2>
                {modal === "import"
                  ? "Importar fluxo (rascunho)"
                  : modal === "enroll"
                    ? "Inscrever contato no funil"
                    : modal === "consent"
                      ? "Registrar consentimento"
                      : (form.id ? "Editar " : "Criar ") +
                        (modal === "flows"
                          ? "fluxo"
                          : modal === "products"
                            ? "produto"
                            : modal === "integrations"
                              ? "canal"
                              : "modelo")}
              </h2>
              <button
                disabled={busy}
                onClick={() => {
                  setModal("");
                  setForm({});
                }}
              >
                Fechar
              </button>
            </div>
            {!["consent", "enroll", "import"].includes(modal) && (
              <Field
                label="Nome"
                value={form.name}
                onChange={(v) => setForm({ ...form, name: v })}
              />
            )}
            {modal === "import" && (
              <label>
                JSON exportado do TrafficAI
                <textarea
                  style={{ minHeight: 220 }}
                  value={form.body || ""}
                  onChange={(e) => setForm({ ...form, body: e.target.value })}
                />
                <small>
                  A importação cria um rascunho e valida as referências da sua
                  conta.
                </small>
              </label>
            )}
            {modal === "enroll" && (
              <>
                <p>
                  {detail?.contact_name}: a inscrição poderá enviar mensagens e
                  executar as ações do fluxo quando o worker estiver ativo.
                </p>
                <label>
                  Fluxo publicado
                  <select
                    value={enrollFlow}
                    onChange={(e) => setEnrollFlow(e.target.value)}
                  >
                    <option value="">Selecionar</option>
                    {flowOptions
                      .filter(
                        (f) => f.status === "active" && f.published_version,
                      )
                      .map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.name}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  <span>
                    <input
                      type="checkbox"
                      checked={allowReentry}
                      onChange={(e) => setAllowReentry(e.target.checked)}
                    />{" "}
                    Permitir nova inscrição se a anterior já terminou
                  </span>
                </label>
              </>
            )}
            {modal === "products" && (
              <>
                <Field
                  label="Preço"
                  type="number"
                  value={form.price}
                  onChange={(v) => setForm({ ...form, price: v })}
                />
                <label>
                  Fonte de vendas
                  <select
                    value={form.source_id || ""}
                    onChange={(e) =>
                      setForm({ ...form, source_id: e.target.value })
                    }
                  >
                    <option value="">Selecionar</option>
                    {catalog.sources?.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </label>
                <Field
                  label="ID do produto na plataforma"
                  value={form.external_product_id}
                  onChange={(v) => setForm({ ...form, external_product_id: v })}
                />
                <Field
                  label="URL do checkout (HTTPS)"
                  value={form.checkout_url}
                  onChange={(v) => setForm({ ...form, checkout_url: v })}
                />
              </>
            )}
            {modal === "products" && (
              <>
                <Field
                  label="Descrição"
                  value={form.description}
                  onChange={(v) => setForm({ ...form, description: v })}
                />
                <Field
                  label="Página de vendas HTTPS"
                  value={form.sales_url}
                  onChange={(v) => setForm({ ...form, sales_url: v })}
                />
                <Field
                  label="URL de entrega HTTPS"
                  value={form.delivery_url}
                  onChange={(v) => setForm({ ...form, delivery_url: v })}
                />
                <OfferFields
                  offers={form.offers || []}
                  onChange={(offers) => setForm({ ...form, offers })}
                />
              </>
            )}
            {modal === "integrations" && (
              <>
                <label>
                  Provedor
                  <select
                    value={form.provider || ""}
                    onChange={(e) =>
                      setForm({ ...form, provider: e.target.value, config: {} })
                    }
                  >
                    <option value="">Selecionar</option>
                    <option value="resend">Resend (e-mail)</option>
                    <option value="twilio">Twilio (SMS)</option>
                    <option value="agent_webhook">
                      Agente externo configurado
                    </option>
                    <option value="webhook">Webhook autenticado</option>
                  </select>
                </label>
                {form.provider === "resend" && (
                  <Field
                    label="Remetente verificado no Resend"
                    value={form.config?.from}
                    onChange={(v) =>
                      setForm({ ...form, config: { ...form.config, from: v } })
                    }
                  />
                )}{" "}
                {["agent_webhook", "webhook"].includes(form.provider || "") && (
                  <>
                    <Field
                      label="Endpoint HTTPS"
                      value={form.config?.url}
                      onChange={(v) =>
                        setForm({ ...form, config: { ...form.config, url: v } })
                      }
                    />
                    <label>
                      <span>
                        <input
                          type="checkbox"
                          checked={form.config?.paid === true}
                          onChange={(e) =>
                            setForm({
                              ...form,
                              config: {
                                ...form.config,
                                paid: e.target.checked,
                              },
                            })
                          }
                        />{" "}
                        Há cobrança por chamada
                      </span>
                    </label>
                    {form.config?.paid && (
                      <>
                        <Field
                          label="Custo máximo por chamada"
                          type="number"
                          value={form.config.cost_per_call}
                          onChange={(v) =>
                            setForm({
                              ...form,
                              config: {
                                ...form.config,
                                cost_per_call: Number(v),
                              },
                            })
                          }
                        />
                        <label>
                          Moeda
                          <select
                            value={form.config.currency || "USD"}
                            onChange={(e) =>
                              setForm({
                                ...form,
                                config: {
                                  ...form.config,
                                  currency: e.target.value,
                                },
                              })
                            }
                          >
                            <option>USD</option>
                            <option>BRL</option>
                            <option>EUR</option>
                          </select>
                        </label>
                      </>
                    )}
                  </>
                )}
                {form.provider === "twilio" && (
                  <>
                    <Field
                      label="Account SID"
                      value={form.config?.account_sid}
                      onChange={(v) =>
                        setForm({
                          ...form,
                          config: { ...form.config, account_sid: v },
                        })
                      }
                    />
                    <Field
                      label="Telefone remetente (+55…)"
                      value={form.config?.from}
                      onChange={(v) =>
                        setForm({
                          ...form,
                          config: { ...form.config, from: v },
                        })
                      }
                    />
                  </>
                )}
                <Field
                  label="Credencial do provedor (armazenada criptografada)"
                  type="password"
                  value={form.token}
                  onChange={(v) => setForm({ ...form, token: v })}
                />
                <p>
                  A conexão real depende de validação com o provedor. O cadastro
                  não realiza envios.
                </p>
                <Link className="aw-link" href="/comercial/integrations">
                  Gerenciar WhatsApp Cloud oficial
                </Link>
              </>
            )}
            {modal === "integrations" && form.provider === "resend" && (
              <Field
                label="Segredo de assinatura do webhook Resend (opcional)"
                type="password"
                value={form.webhook_secret}
                onChange={(v) => setForm({ ...form, webhook_secret: v })}
              />
            )}
            {["templates", "consent"].includes(modal) && (
              <label>
                Canal
                <select
                  value={form.channel || "email"}
                  onChange={(e) =>
                    setForm({ ...form, channel: e.target.value })
                  }
                >
                  {["email", "whatsapp", "sms"].map((c) => (
                    <option key={c} value={c}>
                      {labels[c]}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {modal === "templates" && (
              <>
                <Field
                  label="Prévia na caixa de entrada (preheader)"
                  value={form.preheader}
                  onChange={(v) => setForm({ ...form, preheader: v })}
                />
                <label>
                  Finalidade
                  <select
                    value={form.purpose || "transactional"}
                    onChange={(e) =>
                      setForm({ ...form, purpose: e.target.value })
                    }
                  >
                    <option value="transactional">Transacional</option>
                    <option value="marketing">Marketing</option>
                  </select>
                </label>
                <Field
                  label="Assunto (e-mail)"
                  value={form.subject}
                  onChange={(v) => setForm({ ...form, subject: v })}
                />
                <label>
                  Conteúdo
                  <textarea
                    value={form.body || ""}
                    onChange={(e) => setForm({ ...form, body: e.target.value })}
                  />
                  <small>
                    Variáveis: {"{{name}}, {{product}}, {{checkout_url}}"}
                  </small>
                </label>
                {(form.channel || "email") === "email" && (
                  <TemplateDesigner
                    blocks={form.blocks || []}
                    body={form.body || ""}
                    preheader={form.preheader || ""}
                    onChange={(blocks) => setForm({ ...form, blocks })}
                  />
                )}
                {form.channel === "whatsapp" && (
                  <Field
                    label="Parâmetros do template Cloud, na ordem (ex.: name,product,unsubscribe_url)"
                    value={(form.parameters || []).join(",")}
                    onChange={(v) =>
                      setForm({
                        ...form,
                        parameters: v
                          .split(",")
                          .map((x) => x.trim())
                          .filter(Boolean),
                      })
                    }
                  />
                )}
                {form.channel === "whatsapp" && (
                  <Field
                    label="Nome do template aprovado na Meta (somente Cloud)"
                    value={form.provider_template}
                    onChange={(v) => setForm({ ...form, provider_template: v })}
                  />
                )}
              </>
            )}
            {modal === "consent" && (
              <>
                <label>
                  Estado
                  <select
                    value={form.status}
                    onChange={(e) =>
                      setForm({ ...form, status: e.target.value })
                    }
                  >
                    <option value="opted_out">Não receber</option>
                    <option value="opted_in">Consentiu receber</option>
                  </select>
                </label>
                <Field
                  label="Origem e evidência da autorização"
                  value={form.evidence}
                  onChange={(v) => setForm({ ...form, evidence: v })}
                />
                <p>
                  Registre apenas autorizações reais. Estar no CRM não significa
                  consentimento para receber campanhas.
                </p>
              </>
            )}
            {error && <ErrorFeedback message={error} />}
            <button
              className="primary"
              disabled={
                busy ||
                (["flows", "products", "templates", "integrations"].includes(
                  modal,
                ) &&
                  !form.name?.trim()) ||
                (modal === "enroll" && !enrollFlow) ||
                (modal === "consent" && !form.evidence?.trim()) ||
                (modal === "import" && !form.body?.trim())
              }
              onClick={
                modal === "consent"
                  ? async () => {
                      setBusy(true);
                      try {
                        await w.post(
                          "/contacts/" + detail?.id + "/consent",
                          form,
                        );
                        setModal("");
                        setDetail(null);
                        await load();
                      } catch (e) {
                        setError(String(e));
                      } finally {
                        setBusy(false);
                      }
                    }
                  : create
              }
            >
              {busy ? "Salvando…" : "Salvar"}
            </button>
          </section>
        </ModalFrame>
      )}
      {detail && !modal && (
        <ModalFrame onClose={() => setDetail(null)}>
          <section className="aw-card" role="dialog" aria-modal="true">
            <div className="aw-section-title">
              <h2>{detail.flow_name || detail.name || "Execução"}</h2>
              <button onClick={() => setDetail(null)}>Fechar</button>
            </div>
            {error && <ErrorFeedback message={error} />}
            {detail.steps ? (
              <>
                <p>
                  Estado: {labels[detail.status || ""] || detail.status} ·
                  versão {detail.version}
                </p>
                {detail.test_mode && (
                  <div className="aw-notice">Teste sem efeitos externos</div>
                )}
                <table>
                  <thead>
                    <tr>
                      <th>Bloco</th>
                      <th>Estado</th>
                      <th>Resultado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.steps.map((s) => (
                      <tr key={s.id}>
                        <td>{s.node_id}</td>
                        <td>{labels[s.status] || s.status}</td>
                        <td>
                          {s.error_code || s.output?.status || "Concluído"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {detail.jobs && (
                  <div className="aw-card">
                    <h3>Próximas etapas</h3>
                    {detail.jobs.map((job, index) => (
                      <p key={job.node_id + String(index)}>
                        {job.node_id} · {labels[job.status] || job.status} ·{" "}
                        {new Date(job.due_at).toLocaleString("pt-BR")} ·{" "}
                        {job.attempts} tentativa(s)
                      </p>
                    ))}
                  </div>
                )}
                {detail.status === "intervention" && (
                  <button
                    onClick={async () => {
                      try {
                        await w.post("/runs/" + detail.id + "/resume", {
                          confirm: true,
                        });
                        setDetail(await w.get<Row>("/runs/" + detail.id));
                      } catch (e) {
                        setError(e instanceof Error ? e.message : String(e));
                      }
                    }}
                  >
                    Retomar após confirmação do provedor
                  </button>
                )}
                {[
                  "queued",
                  "running",
                  "waiting",
                  "blocked",
                  "intervention",
                ].includes(detail.status || "") && (
                  <button
                    onClick={async () => {
                      await w.post("/runs/" + detail.id + "/cancel");
                      setDetail(await w.get<Row>("/runs/" + detail.id));
                    }}
                  >
                    Cancelar execução
                  </button>
                )}
                <button
                  onClick={async () =>
                    setDetail(await w.get<Row>("/runs/" + detail.id))
                  }
                >
                  Atualizar estado
                </button>
              </>
            ) : (
              <div className="aw-details">
                {Object.entries(detail)
                  .filter(([k]) =>
                    [
                      "name",
                      "description",
                      "subject",
                      "body",
                      "preheader",
                      "channel",
                      "provider",
                      "purpose",
                      "status",
                      "contact_name",
                      "contact_email",
                      "contact_phone",
                      "sales_url",
                      "checkout_url",
                      "delivery_url",
                      "created_at",
                      "external_product_id",
                    ].includes(k),
                  )
                  .map(([k, v]) => (
                    <p key={k}>
                      <strong>
                        {
                          (
                            {
                              name: "Nome",
                              description: "Descrição",
                              subject: "Assunto",
                              body: "Conteúdo",
                              preheader: "Prévia",
                              channel: "Canal",
                              provider: "Provedor",
                              purpose: "Finalidade",
                              status: "Estado",
                              contact_name: "Contato",
                              contact_email: "E-mail",
                              contact_phone: "Telefone",
                              sales_url: "Página de vendas",
                              checkout_url: "Checkout",
                              delivery_url: "Entrega",
                              created_at: "Criado em",
                              external_product_id: "Identificação no checkout",
                            } as Record<string, string>
                          )[k]
                        }
                      </strong>
                      :{" "}
                      {typeof v === "object"
                        ? JSON.stringify(v)
                        : String(v ?? "—")}
                    </p>
                  ))}
              </div>
            )}
          </section>
        </ModalFrame>
      )}
    </>
  );
}
function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string | number | undefined;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <label>
      {label}
      <input
        type={type}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
