// ==============================
// TrafficAI — Commercial: Tipos TypeScript
// Mapeiam 1:1 as tabelas comm_* da migration 029_commercial.sql
// ==============================

// ----- ENUMS / UNIONS -----

export type ExternalSource = 'kommo' | 'manual' | 'whatsapp' | 'rd_station' | 'pipedrive';
export type IntegrationType = 'whatsapp_evolution' | 'whatsapp_cloud';
export type IntegrationStatus = 'disconnected' | 'connecting' | 'connected' | 'error';
export type StageType = 'incoming' | 'normal' | 'won' | 'lost';
export type DealStatus = 'open' | 'won' | 'lost';
export type ConversationStatus = 'open' | 'pending' | 'closed';
export type MessageDirection = 'in' | 'out';
export type MessageType = 'text' | 'image' | 'audio' | 'video' | 'document' | 'sticker' | 'location';
export type ConversationChannel = 'whatsapp' | 'webchat' | 'instagram' | 'other';
export type TaskStatus = 'pending' | 'completed' | 'overdue' | 'cancelled';
export type TaskType = 'call' | 'meeting' | 'email' | 'whatsapp' | 'follow_up' | 'other';
export type SalespersonRole = 'sdr' | 'closer' | 'manager';
export type LeadSourceType = 'whatsapp_number' | 'channel' | 'campaign' | 'utm' | 'referral' | 'organic' | 'other';
export type StageHistoryReason = 'created' | 'manual' | 'webhook' | 'won' | 'lost';

// ----- ROW TYPES (mapeiam linhas do Postgres) -----

export interface CommSalespersonRow {
    id: string;
    user_id: string;
    client_id: string | null;
    external_id: string | null;
    external_source: ExternalSource | null;
    name: string;
    email: string | null;
    phone: string | null;
    role: SalespersonRole | null;
    monthly_goal_value: string;        // NUMERIC vem como string do pg
    avatar_color: string;
    active: boolean;
    created_at: Date;
    updated_at: Date;
}

export interface CommIntegrationRow {
    id: string;
    user_id: string;
    client_id: string | null;
    type: IntegrationType;
    name: string | null;
    status: IntegrationStatus;
    config: Record<string, unknown>;
    credentials: Record<string, unknown>;
    connected_at: Date | null;
    last_event_at: Date | null;
    last_error: string | null;
    created_at: Date;
    updated_at: Date;
}

export interface CommPipelineRow {
    id: string;
    user_id: string;
    client_id: string | null;
    external_id: string | null;
    external_source: ExternalSource | null;
    name: string;
    is_main: boolean;
    position: number;
    archived: boolean;
    created_at: Date;
    updated_at: Date;
}

export interface CommPipelineStageRow {
    id: string;
    pipeline_id: string;
    external_id: string | null;
    name: string;
    position: number;
    color: string;
    win_probability: string;
    stage_type: StageType;
    stuck_threshold_days: number;
    created_at: Date;
    updated_at: Date;
}

export interface CommLeadSourceRow {
    id: string;
    user_id: string;
    client_id: string | null;
    name: string;
    type: LeadSourceType;
    identifier: string | null;
    color: string;
    active: boolean;
    created_at: Date;
    updated_at: Date;
}

export interface CommDealRow {
    id: string;
    user_id: string;
    client_id: string | null;
    external_id: string | null;
    external_source: ExternalSource | null;
    pipeline_id: string;
    stage_id: string;
    salesperson_id: string | null;
    source_id: string | null;
    contact_name: string | null;
    contact_phone: string | null;
    contact_email: string | null;
    title: string | null;
    value: string;
    currency: string;
    status: DealStatus;
    loss_reason: string | null;
    custom_fields: Record<string, unknown>;
    last_stage_change_at: Date;
    last_activity_at: Date;
    expected_close_at: Date | null;
    closed_at: Date | null;
    created_at: Date;
    updated_at: Date;
}

export interface CommDealStageHistoryRow {
    id: string;
    deal_id: string;
    user_id: string;
    from_stage_id: string | null;
    to_stage_id: string;
    moved_at: Date;
    moved_by_salesperson_id: string | null;
    reason: StageHistoryReason | null;
    duration_in_from_seconds: number | null;
    deal_value_snapshot: string;
    created_at: Date;
}

export interface CommConversationRow {
    id: string;
    user_id: string;
    client_id: string | null;
    integration_id: string | null;
    deal_id: string | null;
    salesperson_id: string | null;
    source_id: string | null;
    external_id: string | null;
    channel: ConversationChannel;
    contact_name: string | null;
    contact_phone: string;
    contact_email: string | null;
    status: ConversationStatus;
    message_count: number;
    incoming_count: number;
    outgoing_count: number;
    first_inbound_at: Date | null;
    first_response_at: Date | null;
    first_response_seconds: number | null;
    last_message_at: Date;
    last_message_direction: MessageDirection | null;
    unanswered_since: Date | null;
    closed_at: Date | null;
    created_at: Date;
    updated_at: Date;
}

export interface CommMessageRow {
    id: string;
    conversation_id: string;
    user_id: string;
    external_id: string | null;
    direction: MessageDirection;
    content: string | null;
    media_url: string | null;
    media_type: string | null;
    type: MessageType;
    sent_at: Date;
    delivered_at: Date | null;
    read_at: Date | null;
    sender_salesperson_id: string | null;
    raw_payload: Record<string, unknown> | null;
    created_at: Date;
}

export interface CommTaskRow {
    id: string;
    user_id: string;
    client_id: string | null;
    deal_id: string | null;
    conversation_id: string | null;
    salesperson_id: string | null;
    external_id: string | null;
    external_source: ExternalSource | null;
    title: string;
    description: string | null;
    type: TaskType | null;
    due_at: Date | null;
    completed_at: Date | null;
    status: TaskStatus;
    created_at: Date;
    updated_at: Date;
}

export interface CommShareLinkRow {
    id: string;
    user_id: string;
    client_id: string | null;
    token: string;
    name: string;
    filters: ShareLinkFilters;
    password_hash: string | null;
    expires_at: Date | null;
    access_count: number;
    last_accessed_at: Date | null;
    active: boolean;
    created_at: Date;
    updated_at: Date;
}

export interface CommShareLinkAccessRow {
    id: string;
    share_link_id: string;
    accessed_at: Date;
    ip: string | null;
    user_agent: string | null;
    referer: string | null;
    success: boolean;
}

export interface CommDailyMetricRow {
    id: string;
    user_id: string;
    client_id: string | null;
    salesperson_id: string | null;
    pipeline_id: string | null;
    date: Date;
    messages_received: number;
    messages_sent: number;
    conversations_opened: number;
    conversations_closed: number;
    avg_response_time_seconds: number;
    p90_response_time_seconds: number;
    deals_created: number;
    deals_won: number;
    deals_lost: number;
    deals_won_value: string;
    deals_lost_value: string;
    tasks_created: number;
    tasks_completed: number;
    messages_by_channel: Record<string, number>;
    leads_by_source: Record<string, number>;
    created_at: Date;
    updated_at: Date;
}

// ----- VIEW TYPES (saída de cálculos / API) -----

export interface FunnelStageView {
    stageId: string;
    name: string;
    color: string;
    position: number;
    stageType: StageType;
    // estado atual (deals que ESTÃO no estágio agora)
    totalLeads: number;
    totalValue: number;
    // movimentos NO PERÍODO selecionado (vindos do deal_stage_history)
    enteredInPeriod: number;       // entradas (qualquer deal que veio para esta etapa)
    enteredValueInPeriod: number;
    advancedInPeriod: number;      // saiu para uma etapa "à frente"
    advancedValueInPeriod: number;
    lostInPeriod: number;          // saiu por perda (status=lost ou foi para stage_type=lost)
    lostValueInPeriod: number;
    // taxa de conversão pra próxima etapa: avancedInPeriod / enteredInPeriod
    conversionToNext: number | null;   // 0–100 ou null se não aplicável
    avgDaysInStage: number;            // tempo médio que deals ficam nesta etapa
}

// ----- HERO KPIs -----

export interface HeroKpiCard {
    label: string;
    value: number;
    valueFormatted: string;        // "R$ 124.500" ou "32.5%"
    delta: number;                 // valor absoluto vs período anterior
    deltaPercent: number;          // % vs período anterior
    sparkline: number[];           // 14 pontos pra microchart
    isPositiveTrend: boolean;      // se delta positivo é "bom" (ex: receita +5% = bom; tempo de resposta +5% = ruim)
    icon: string;                  // emoji ou nome de ícone Lucide
    color: 'green' | 'purple' | 'red' | 'yellow' | 'blue';
    /** rota pra drill-down quando clicado */
    href?: string;
}

// ----- INSIGHTS AUTOMÁTICOS -----

export type InsightSeverity = 'critical' | 'warning' | 'info' | 'success';

export interface InsightCard {
    severity: InsightSeverity;
    icon: string;                  // 🚨 📈 🎯 ⏰ 💡 🏆
    title: string;                 // frase em destaque
    description: string;           // texto secundário com números/contexto
    metric?: string;               // valor destacado (ex: "73%", "5 deals")
    href?: string;                 // drill-down opcional
}

export interface ConversationKpis {
    messagesReceived: {
        total: number;
        byChannel: Array<{ channel: string; count: number }>;
    };
    activeConversations: number;
    activeConversationsDelta: number;          // vs período anterior
    unansweredChats: number;
    unansweredChatsDelta: number;
    avgResponseTimeMinutes: number;
    longestWaitDays: number;                    // lead único com maior espera
}

export interface LeadsKpis {
    wonLeads: number;
    wonValue: number;
    wonDelta: number;
    activeLeads: number;
    activeValue: number;
    activeDelta: number;
}

export interface TasksKpis {
    pendingTasks: number;
    overdueTasks: number;
    tasksDelta: number;
}

export interface LeadSourceView {
    sourceId: string | null;     // null = "Outros"
    name: string;
    color: string;
    count: number;
    percentage: number;
}

export interface SalespersonPerformanceView {
    salespersonId: string;
    name: string;
    avatarColor: string;
    messagesSent: number;
    avgFirstResponseSeconds: number;
    meetingsHeld: number;
    proposalsSent: number;
    dealsWon: number;
    dealsWonValue: number;
    monthlyGoalValue: number;
    goalProgressPct: number;
}

// ----- PARAMS / FILTERS -----

export interface DateRange {
    from: Date;
    to: Date;
}

export type PeriodPreset = 'today' | '7d' | '30d' | '90d' | 'this_month' | 'custom';

export interface CommercialFilters {
    period: PeriodPreset;
    dateRange?: DateRange;        // obrigatório quando period='custom'
    pipelineId?: string;
    salespersonId?: string;
    clientId?: string;
}

export interface ShareLinkFilters {
    period?: PeriodPreset;
    dateRange?: { from: string; to: string }; // ISO strings (jsonb safe)
    pipelineId?: string;
    salespersonId?: string;
    clientId?: string;
    pipelinesAllowed?: string[];   // restrição: quais pipelines o link pode mostrar
}
