-- ==============================
-- TrafficAI — Dashboard Comercial (Fase 1: schema)
-- Funil de vendas, conversas, vendedores, tarefas, links de compartilhamento.
-- Tudo escopado por user_id (tenant) + client_id opcional (dashboard por cliente).
-- Prefixo "comm_" pra namespacar e evitar conflito com tabelas existentes.
-- ==============================

-- ==============================
-- VENDEDORES
-- ==============================
CREATE TABLE IF NOT EXISTS comm_salespeople (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
    external_id VARCHAR(255),                 -- id no CRM (ex: kommo user id)
    external_source VARCHAR(50),              -- 'kommo' | 'manual'
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    phone VARCHAR(50),
    role VARCHAR(50),                         -- 'sdr' | 'closer' | 'manager'
    monthly_goal_value NUMERIC(12,2) DEFAULT 0,
    avatar_color VARCHAR(20) DEFAULT '#6366f1',
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_comm_salespeople_user ON comm_salespeople(user_id);
CREATE INDEX IF NOT EXISTS idx_comm_salespeople_client ON comm_salespeople(client_id) WHERE client_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_comm_salespeople_external
    ON comm_salespeople(user_id, external_source, external_id)
    WHERE external_source IS NOT NULL AND external_id IS NOT NULL;

-- ==============================
-- INTEGRAÇÕES (WhatsApp, etc — Kommo continua em tracking_sources)
-- ==============================
CREATE TABLE IF NOT EXISTS comm_integrations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
    type VARCHAR(50) NOT NULL,                -- 'whatsapp_evolution' | 'whatsapp_cloud'
    name VARCHAR(255),
    status VARCHAR(20) DEFAULT 'disconnected',-- 'disconnected' | 'connecting' | 'connected' | 'error'
    config JSONB NOT NULL DEFAULT '{}'::jsonb,    -- instance name, base url, webhook url, etc
    credentials JSONB NOT NULL DEFAULT '{}'::jsonb,-- tokens, api keys (encriptar futuramente)
    connected_at TIMESTAMPTZ,
    last_event_at TIMESTAMPTZ,
    last_error TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_comm_integrations_user ON comm_integrations(user_id);
CREATE INDEX IF NOT EXISTS idx_comm_integrations_client ON comm_integrations(client_id) WHERE client_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_comm_integrations_type ON comm_integrations(type, status);

-- ==============================
-- PIPELINES
-- ==============================
CREATE TABLE IF NOT EXISTS comm_pipelines (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
    external_id VARCHAR(255),
    external_source VARCHAR(50),              -- 'kommo' | 'manual'
    name VARCHAR(255) NOT NULL,
    is_main BOOLEAN DEFAULT false,
    position INTEGER DEFAULT 0,
    archived BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_comm_pipelines_user ON comm_pipelines(user_id);
CREATE INDEX IF NOT EXISTS idx_comm_pipelines_client ON comm_pipelines(client_id) WHERE client_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_comm_pipelines_external
    ON comm_pipelines(user_id, external_source, external_id)
    WHERE external_source IS NOT NULL AND external_id IS NOT NULL;

-- ==============================
-- ETAPAS DO PIPELINE
-- ==============================
CREATE TABLE IF NOT EXISTS comm_pipeline_stages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    pipeline_id UUID NOT NULL REFERENCES comm_pipelines(id) ON DELETE CASCADE,
    external_id VARCHAR(255),
    name VARCHAR(255) NOT NULL,
    position INTEGER NOT NULL,
    color VARCHAR(20) DEFAULT '#6366f1',
    win_probability NUMERIC(5,2) DEFAULT 0,   -- 0–100
    stage_type VARCHAR(20) DEFAULT 'normal',  -- 'incoming' | 'normal' | 'won' | 'lost'
    stuck_threshold_days INT DEFAULT 7,       -- highlight deal parado há +X dias
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_comm_pipeline_stages_pipeline ON comm_pipeline_stages(pipeline_id, position);
CREATE UNIQUE INDEX IF NOT EXISTS idx_comm_pipeline_stages_external
    ON comm_pipeline_stages(pipeline_id, external_id)
    WHERE external_id IS NOT NULL;

-- ==============================
-- ORIGENS DE LEAD (canais, números WA, campanhas, UTMs)
-- ==============================
CREATE TABLE IF NOT EXISTS comm_lead_sources (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL,                -- 'whatsapp_number' | 'channel' | 'campaign' | 'utm' | 'referral' | 'organic' | 'other'
    identifier VARCHAR(500),                  -- phone, utm string, campaign id, etc
    color VARCHAR(20) DEFAULT '#6366f1',
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_comm_lead_sources_user ON comm_lead_sources(user_id);
CREATE INDEX IF NOT EXISTS idx_comm_lead_sources_client ON comm_lead_sources(client_id) WHERE client_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_comm_lead_sources_identifier ON comm_lead_sources(user_id, type, identifier);

-- ==============================
-- DEALS / LEADS
-- ==============================
CREATE TABLE IF NOT EXISTS comm_deals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
    external_id VARCHAR(255),
    external_source VARCHAR(50),              -- 'kommo' | 'manual' | 'whatsapp'
    pipeline_id UUID NOT NULL REFERENCES comm_pipelines(id) ON DELETE CASCADE,
    stage_id UUID NOT NULL REFERENCES comm_pipeline_stages(id) ON DELETE RESTRICT,
    salesperson_id UUID REFERENCES comm_salespeople(id) ON DELETE SET NULL,
    source_id UUID REFERENCES comm_lead_sources(id) ON DELETE SET NULL,
    contact_name VARCHAR(255),
    contact_phone VARCHAR(50),
    contact_email VARCHAR(255),
    title VARCHAR(500),
    value NUMERIC(12,2) DEFAULT 0,
    currency VARCHAR(10) DEFAULT 'BRL',
    status VARCHAR(20) DEFAULT 'open',        -- 'open' | 'won' | 'lost'
    loss_reason VARCHAR(255),
    custom_fields JSONB NOT NULL DEFAULT '{}'::jsonb,
    last_stage_change_at TIMESTAMPTZ DEFAULT NOW(),
    last_activity_at TIMESTAMPTZ DEFAULT NOW(),
    expected_close_at DATE,
    closed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_comm_deals_user ON comm_deals(user_id);
CREATE INDEX IF NOT EXISTS idx_comm_deals_client ON comm_deals(client_id) WHERE client_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_comm_deals_pipeline_stage ON comm_deals(pipeline_id, stage_id);
CREATE INDEX IF NOT EXISTS idx_comm_deals_salesperson ON comm_deals(salesperson_id) WHERE salesperson_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_comm_deals_status ON comm_deals(user_id, status);
CREATE INDEX IF NOT EXISTS idx_comm_deals_created ON comm_deals(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_comm_deals_stage_change ON comm_deals(stage_id, last_stage_change_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_comm_deals_external
    ON comm_deals(user_id, external_source, external_id)
    WHERE external_source IS NOT NULL AND external_id IS NOT NULL;

-- ==============================
-- HISTÓRICO DE MOVIMENTAÇÃO ENTRE ETAPAS
-- Essencial para calcular entrada/saída por estágio em qualquer período.
-- ==============================
CREATE TABLE IF NOT EXISTS comm_deal_stage_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    deal_id UUID NOT NULL REFERENCES comm_deals(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    from_stage_id UUID REFERENCES comm_pipeline_stages(id) ON DELETE SET NULL,
    to_stage_id UUID NOT NULL REFERENCES comm_pipeline_stages(id) ON DELETE CASCADE,
    moved_at TIMESTAMPTZ DEFAULT NOW(),
    moved_by_salesperson_id UUID REFERENCES comm_salespeople(id) ON DELETE SET NULL,
    reason VARCHAR(20),                       -- 'created' | 'manual' | 'webhook' | 'won' | 'lost'
    duration_in_from_seconds INT,             -- tempo que ficou na etapa anterior
    deal_value_snapshot NUMERIC(12,2) DEFAULT 0,-- valor do deal no momento do movimento
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_comm_stage_hist_deal ON comm_deal_stage_history(deal_id, moved_at);
CREATE INDEX IF NOT EXISTS idx_comm_stage_hist_to ON comm_deal_stage_history(to_stage_id, moved_at);
CREATE INDEX IF NOT EXISTS idx_comm_stage_hist_from ON comm_deal_stage_history(from_stage_id, moved_at) WHERE from_stage_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_comm_stage_hist_user_date ON comm_deal_stage_history(user_id, moved_at DESC);

-- ==============================
-- CONVERSAS (WhatsApp / outros canais)
-- ==============================
CREATE TABLE IF NOT EXISTS comm_conversations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
    integration_id UUID REFERENCES comm_integrations(id) ON DELETE SET NULL,
    deal_id UUID REFERENCES comm_deals(id) ON DELETE SET NULL,
    salesperson_id UUID REFERENCES comm_salespeople(id) ON DELETE SET NULL,
    source_id UUID REFERENCES comm_lead_sources(id) ON DELETE SET NULL,
    external_id VARCHAR(255),
    channel VARCHAR(50) DEFAULT 'whatsapp',   -- 'whatsapp' | 'webchat' | 'instagram' | 'other'
    contact_name VARCHAR(255),
    contact_phone VARCHAR(50) NOT NULL,
    contact_email VARCHAR(255),
    status VARCHAR(20) DEFAULT 'open',        -- 'open' | 'pending' | 'closed'
    message_count INT NOT NULL DEFAULT 0,
    incoming_count INT NOT NULL DEFAULT 0,
    outgoing_count INT NOT NULL DEFAULT 0,
    first_inbound_at TIMESTAMPTZ,
    first_response_at TIMESTAMPTZ,
    first_response_seconds INT,               -- tempo até 1ª resposta out depois da 1ª in
    last_message_at TIMESTAMPTZ DEFAULT NOW(),
    last_message_direction VARCHAR(10),       -- 'in' | 'out'
    unanswered_since TIMESTAMPTZ,             -- preenchido quando última msg é 'in'
    closed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_comm_conversations_user ON comm_conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_comm_conversations_client ON comm_conversations(client_id) WHERE client_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_comm_conversations_phone ON comm_conversations(user_id, contact_phone);
CREATE INDEX IF NOT EXISTS idx_comm_conversations_status ON comm_conversations(user_id, status, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_comm_conversations_unanswered ON comm_conversations(user_id, unanswered_since) WHERE unanswered_since IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_comm_conversations_salesperson ON comm_conversations(salesperson_id) WHERE salesperson_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_comm_conversations_external
    ON comm_conversations(integration_id, external_id)
    WHERE external_id IS NOT NULL AND integration_id IS NOT NULL;

-- ==============================
-- MENSAGENS
-- ==============================
CREATE TABLE IF NOT EXISTS comm_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID NOT NULL REFERENCES comm_conversations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    external_id VARCHAR(255),
    direction VARCHAR(10) NOT NULL,           -- 'in' | 'out'
    content TEXT,
    media_url TEXT,
    media_type VARCHAR(50),
    type VARCHAR(20) DEFAULT 'text',          -- 'text' | 'image' | 'audio' | 'video' | 'document' | 'sticker' | 'location'
    sent_at TIMESTAMPTZ NOT NULL,
    delivered_at TIMESTAMPTZ,
    read_at TIMESTAMPTZ,
    sender_salesperson_id UUID REFERENCES comm_salespeople(id) ON DELETE SET NULL,
    raw_payload JSONB,                        -- payload original do provider (debug)
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_comm_messages_conv ON comm_messages(conversation_id, sent_at);
CREATE INDEX IF NOT EXISTS idx_comm_messages_user_sent ON comm_messages(user_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_comm_messages_direction ON comm_messages(conversation_id, direction, sent_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_comm_messages_external
    ON comm_messages(conversation_id, external_id)
    WHERE external_id IS NOT NULL;

-- ==============================
-- TAREFAS
-- ==============================
CREATE TABLE IF NOT EXISTS comm_tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
    deal_id UUID REFERENCES comm_deals(id) ON DELETE CASCADE,
    conversation_id UUID REFERENCES comm_conversations(id) ON DELETE SET NULL,
    salesperson_id UUID REFERENCES comm_salespeople(id) ON DELETE SET NULL,
    external_id VARCHAR(255),
    external_source VARCHAR(50),              -- 'kommo' | 'manual'
    title VARCHAR(500) NOT NULL,
    description TEXT,
    type VARCHAR(50),                         -- 'call' | 'meeting' | 'email' | 'whatsapp' | 'follow_up' | 'other'
    due_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    status VARCHAR(20) DEFAULT 'pending',     -- 'pending' | 'completed' | 'overdue' | 'cancelled'
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_comm_tasks_user ON comm_tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_comm_tasks_client ON comm_tasks(client_id) WHERE client_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_comm_tasks_deal ON comm_tasks(deal_id) WHERE deal_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_comm_tasks_salesperson ON comm_tasks(salesperson_id) WHERE salesperson_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_comm_tasks_status_due ON comm_tasks(user_id, status, due_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_comm_tasks_external
    ON comm_tasks(user_id, external_source, external_id)
    WHERE external_source IS NOT NULL AND external_id IS NOT NULL;

-- ==============================
-- LINKS DE COMPARTILHAMENTO (dashboard público read-only)
-- ==============================
CREATE TABLE IF NOT EXISTS comm_share_links (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
    token UUID NOT NULL UNIQUE DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    filters JSONB NOT NULL DEFAULT '{}'::jsonb,   -- { period, pipelineId, salespersonId, ... }
    password_hash TEXT,
    expires_at TIMESTAMPTZ,
    access_count INT NOT NULL DEFAULT 0,
    last_accessed_at TIMESTAMPTZ,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_comm_share_links_user ON comm_share_links(user_id);
CREATE INDEX IF NOT EXISTS idx_comm_share_links_token ON comm_share_links(token) WHERE active = true;

-- ==============================
-- LOG DE ACESSOS AOS LINKS PÚBLICOS
-- ==============================
CREATE TABLE IF NOT EXISTS comm_share_link_accesses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    share_link_id UUID NOT NULL REFERENCES comm_share_links(id) ON DELETE CASCADE,
    accessed_at TIMESTAMPTZ DEFAULT NOW(),
    ip VARCHAR(45),
    user_agent TEXT,
    referer TEXT,
    success BOOLEAN DEFAULT true              -- false se senha errada / link expirado
);

CREATE INDEX IF NOT EXISTS idx_comm_share_accesses_link ON comm_share_link_accesses(share_link_id, accessed_at DESC);

-- ==============================
-- AGREGAÇÕES DIÁRIAS (preenchido por cron — período > 7d lê daqui)
-- ==============================
CREATE TABLE IF NOT EXISTS comm_daily_metrics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
    salesperson_id UUID REFERENCES comm_salespeople(id) ON DELETE CASCADE,
    pipeline_id UUID REFERENCES comm_pipelines(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    -- Conversas / mensagens
    messages_received INT NOT NULL DEFAULT 0,
    messages_sent INT NOT NULL DEFAULT 0,
    conversations_opened INT NOT NULL DEFAULT 0,
    conversations_closed INT NOT NULL DEFAULT 0,
    avg_response_time_seconds INT NOT NULL DEFAULT 0,
    p90_response_time_seconds INT NOT NULL DEFAULT 0,
    -- Deals
    deals_created INT NOT NULL DEFAULT 0,
    deals_won INT NOT NULL DEFAULT 0,
    deals_lost INT NOT NULL DEFAULT 0,
    deals_won_value NUMERIC(12,2) NOT NULL DEFAULT 0,
    deals_lost_value NUMERIC(12,2) NOT NULL DEFAULT 0,
    -- Tarefas
    tasks_created INT NOT NULL DEFAULT 0,
    tasks_completed INT NOT NULL DEFAULT 0,
    -- Mensagens por canal (jsonb pra flexibilidade — ex: {"whatsapp": 120, "webchat": 5})
    messages_by_channel JSONB NOT NULL DEFAULT '{}'::jsonb,
    -- Leads por origem (jsonb — ex: {"<source_uuid>": 12, "organic": 4})
    leads_by_source JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- chave única para upsert: ao reagregar o mesmo dia, atualiza ao invés de duplicar
CREATE UNIQUE INDEX IF NOT EXISTS idx_comm_daily_metrics_unique
    ON comm_daily_metrics(
        user_id,
        COALESCE(client_id, '00000000-0000-0000-0000-000000000000'::uuid),
        COALESCE(salesperson_id, '00000000-0000-0000-0000-000000000000'::uuid),
        COALESCE(pipeline_id, '00000000-0000-0000-0000-000000000000'::uuid),
        date
    );
CREATE INDEX IF NOT EXISTS idx_comm_daily_metrics_user_date ON comm_daily_metrics(user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_comm_daily_metrics_client_date ON comm_daily_metrics(client_id, date DESC) WHERE client_id IS NOT NULL;
