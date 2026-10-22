import { api } from "@/lib/api";
export const workflows = {
  get: <T = unknown>(path: string) =>
    api.request<T>("GET", "/automation/workflows" + path),
  post: <T = unknown>(path: string, body?: unknown) =>
    api.request<T>("POST", "/automation/workflows" + path, body),
  put: <T = unknown>(path: string, body: unknown) =>
    api.request<T>("PUT", "/automation/workflows" + path, body),
};
export const labels: Record<string, string> = {
  trigger: "Gatilho",
  condition: "Condição",
  wait: "Espera",
  message: "Mensagem",
  tag: "Tag",
  update_contact: "Atualizar contato",
  crm_task: "Tarefa CRM",
  webhook: "Webhook",
  agent: "Agente IA",
  end: "Encerrar",
  note: "Nota",
  configured: "Configurado",
  verified: "Verificado",
  connected: "Conectado",
  disconnected: "Desconectado",
  open: "Em aberto",
  won: "Ganho",
  lost: "Perdido",
  sent: "Enviada",
  delivered: "Entregue",
  read: "Lida",
  unknown: "Aguardando confirmação",
  suppressed: "Não enviar",
  whatsapp_cloud: "WhatsApp oficial",
  whatsapp_evolution: "WhatsApp · Evolution",
  whatsapp_uazapi: "WhatsApp · UazAPI",
  resend: "E-mail · Resend",
  twilio: "SMS · Twilio",
  agent_webhook: "Agente externo",
  draft: "Rascunho",
  scheduled: "Agendada",
  sending: "Em andamento",
  active: "Ativo",
  paused: "Pausado",
  archived: "Arquivado",
  queued: "Na fila",
  running: "Executando",
  waiting: "Aguardando",
  completed: "Concluído",
  failed: "Falhou",
  canceled: "Cancelado",
  blocked: "Bloqueado",
  intervention: "Requer revisão",
  email: "E-mail",
  whatsapp: "WhatsApp",
  sms: "SMS",
};
export const colors: Record<string, string> = {
  trigger: "#38bdf8",
  condition: "#fbbf24",
  wait: "#c4b5fd",
  message: "#34d399",
  tag: "#fb923c",
  update_contact: "#fb923c",
  crm_task: "#60a5fa",
  webhook: "#22d3ee",
  agent: "#e879f9",
  end: "#94a3b8",
  note: "#94a3b8",
};
export const initialGraph = {
  schemaVersion: 1,
  nodes: [
    {
      id: "start",
      type: "trigger",
      position: { x: 100, y: 160 },
      data: { label: "Início do fluxo", config: { event: "manual" } },
    },
    {
      id: "end",
      type: "end",
      position: { x: 480, y: 160 },
      data: { label: "Encerrar", config: {} },
    },
  ],
  edges: [{ id: "start-end", source: "start", target: "end" }],
};
export interface Item {
  checkout_url?: string;
  config?: {
    paid?: boolean;
    cost_per_call?: number;
    currency?: string;
    url?: string;
  };
  id: string;
  name: string;
  provider?: string;
  channel?: string;
}
export interface Config {
  url?: string;
  paid?: boolean;
  cost_per_call?: number;
  currency?: string;
  prompt?: string;
  costApproved?: boolean;
  event?: string;
  kind?: string;
  value?: string;
  field?: string;
  seconds?: number;
  channel?: string;
  productId?: string;
  promotionProductId?: string;
  buttonText?: string;
  priorityOffer?: boolean;
  excludePurchasedProductIds?: string[];
  templateId?: string;
  integrationId?: string;
  operation?: string;
  tag?: string;
  title?: string;
  text?: string;
  from?: string;
  account_sid?: string;
}
export interface GraphNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: { label: string; config: Config };
}
export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
}
export interface Graph {
  schemaVersion: 1;
  nodes: GraphNode[];
  edges: GraphEdge[];
}
export interface Flow {
  id: string;
  name: string;
  graph: Graph;
  status: string;
  revision: number;
  published_version: number | null;
  recovery: boolean;
  product_id?: string | null;
  source_id?: string | null;
  settings: Record<string, unknown>;
}
export interface Step {
  id: string;
  node_id: string;
  status: string;
  error_code?: string;
  output?: { status?: string };
}
export interface Run {
  id: string;
  status: string;
  steps: Step[];
  jobs: { node_id: string; status: string }[];
}
export interface Catalog {
  events: string[];
  sources: Item[];
  integrations: Item[];
  sendEnabled: boolean;
  workerEnabled: boolean;
}
export interface Offer {
  id: string;
  name: string;
  price: number;
  currency: string;
  checkout_url: string;
  external_product_id?: string;
}
export interface RecordRow {
  active?: boolean;
  description?: string;
  sales_url?: string;
  delivery_url?: string;
  source_id?: string;
  checkout_url?: string;
  offers?: Offer[];
  config?: Config;
  parameters?: string[];
  blocks?: EmailBlock[];
  body?: string;
  subject?: string;
  preheader?: string;
  provider_template?: string;
  language?: string;
  id: string;
  name?: string;
  flow_name?: string;
  contact_name?: string;
  contact_email?: string;
  contact_phone?: string;
  status?: string;
  channel?: string;
  provider?: string;
  test_mode?: boolean;
  price?: number;
  currency?: string;
  published_version?: number;
  external_product_id?: string;
  created_at?: string;
  purpose?: string;
  version?: number;
  steps?: Step[];
  jobs?: {
    node_id: string;
    status: string;
    due_at: string;
    attempts: number;
  }[];
}
export interface EmailBlock {
  type: "text" | "heading" | "button" | "image";
  text: string;
  url?: string;
}
export interface FormValues {
  description?: string;
  sales_url?: string;
  delivery_url?: string;
  offers?: Offer[];
  blocks?: EmailBlock[];
  parameters?: string[];
  id?: string;
  name?: string;
  price?: string;
  channel?: string;
  purpose?: string;
  subject?: string;
  preheader?: string;
  webhook_secret?: string;
  body?: string;
  source_id?: string;
  external_product_id?: string;
  checkout_url?: string;
  provider_template?: string;
  status?: string;
  evidence?: string;
  provider?: string;
  token?: string;
  config?: Config;
}
export interface Overview {
  summary: Record<string, number | null>;
  daily: { day: string; executions: number; completed: number }[];
}
