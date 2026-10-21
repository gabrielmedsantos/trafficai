-- Additive migration. Executar só após aprovação; não inicia fluxos nem importa contatos.
CREATE TABLE IF NOT EXISTS aw_products (
 id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 source_id UUID REFERENCES tracking_sources(id) ON DELETE RESTRICT, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
 price NUMERIC(12,2), currency VARCHAR(3) NOT NULL DEFAULT 'BRL', sales_url TEXT, checkout_url TEXT, delivery_url TEXT,
 platform TEXT, external_product_id TEXT, active BOOLEAN NOT NULL DEFAULT TRUE, tags JSONB NOT NULL DEFAULT '[]',
 offers JSONB NOT NULL DEFAULT '[]', settings JSONB NOT NULL DEFAULT '{}', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(user_id,id)
);
CREATE TABLE IF NOT EXISTS aw_flows (
 id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 source_id UUID REFERENCES tracking_sources(id) ON DELETE RESTRICT, product_id UUID, name TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','active','paused','archived')),
 graph JSONB NOT NULL, revision INT NOT NULL DEFAULT 1, published_version INT, recovery BOOLEAN NOT NULL DEFAULT FALSE,
 settings JSONB NOT NULL DEFAULT '{}',created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 UNIQUE(user_id,id), FOREIGN KEY(user_id,product_id) REFERENCES aw_products(user_id,id)
);
CREATE TABLE IF NOT EXISTS aw_versions (
 flow_id UUID NOT NULL REFERENCES aw_flows(id) ON DELETE CASCADE, version INT NOT NULL, user_id UUID NOT NULL REFERENCES users(id),
 graph JSONB NOT NULL, source_id UUID REFERENCES tracking_sources(id), product_id UUID REFERENCES aw_products(id), recovery BOOLEAN NOT NULL DEFAULT FALSE, settings JSONB NOT NULL DEFAULT '{}', published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 PRIMARY KEY(flow_id,version), UNIQUE(user_id,flow_id,version)
);
CREATE TABLE IF NOT EXISTS aw_events (
 id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 source_id UUID REFERENCES tracking_sources(id),external_id TEXT NOT NULL,event_type TEXT NOT NULL,
 order_id UUID REFERENCES tracking_orders(id) ON DELETE SET NULL,deal_id UUID REFERENCES comm_deals(id) ON DELETE SET NULL,
 product_id UUID, occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),payload JSONB NOT NULL DEFAULT '{}',
 dispatched_at TIMESTAMPTZ,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),UNIQUE(user_id,external_id,event_type),
 FOREIGN KEY(user_id,product_id) REFERENCES aw_products(user_id,id)
);
CREATE TABLE IF NOT EXISTS aw_runs (
 id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 flow_id UUID NOT NULL,version INT NOT NULL,event_id UUID REFERENCES aw_events(id),order_id UUID REFERENCES tracking_orders(id) ON DELETE SET NULL,
 deal_id UUID REFERENCES comm_deals(id) ON DELETE SET NULL,product_id UUID,
 status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','running','waiting','completed','failed','canceled','blocked','intervention')),
 recovery BOOLEAN NOT NULL DEFAULT FALSE,context JSONB NOT NULL DEFAULT '{}',test_mode BOOLEAN NOT NULL DEFAULT FALSE,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),finished_at TIMESTAMPTZ,
 UNIQUE(flow_id,version,event_id),UNIQUE(user_id,id),FOREIGN KEY(user_id,flow_id,version) REFERENCES aw_versions(user_id,flow_id,version),
 FOREIGN KEY(user_id,product_id) REFERENCES aw_products(user_id,id)
);
CREATE TABLE IF NOT EXISTS aw_jobs (
 id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),run_id UUID NOT NULL REFERENCES aw_runs(id) ON DELETE CASCADE,
 node_id TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','running','waiting','completed','failed','canceled','intervention')),
 due_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),locked_until TIMESTAMPTZ,lease_token UUID,attempts INT NOT NULL DEFAULT 0,
 max_attempts INT NOT NULL DEFAULT 3,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),UNIQUE(run_id,node_id)
);
CREATE INDEX IF NOT EXISTS aw_jobs_due ON aw_jobs(status,due_at);
CREATE TABLE IF NOT EXISTS aw_steps (
 id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),run_id UUID NOT NULL REFERENCES aw_runs(id) ON DELETE CASCADE,node_id TEXT NOT NULL,
 status TEXT NOT NULL,attempt INT NOT NULL,output JSONB NOT NULL DEFAULT '{}',error_code TEXT,
 started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),finished_at TIMESTAMPTZ,UNIQUE(run_id,node_id,attempt)
);
CREATE TABLE IF NOT EXISTS aw_templates (
 id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 name TEXT NOT NULL,channel TEXT NOT NULL CHECK(channel IN ('whatsapp','email','sms')),subject TEXT NOT NULL DEFAULT '',body TEXT NOT NULL,
 blocks JSONB NOT NULL DEFAULT '[]',purpose TEXT NOT NULL DEFAULT 'marketing' CHECK(purpose IN ('marketing','transactional')),
 provider_template TEXT,language TEXT NOT NULL DEFAULT 'pt_BR',created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),UNIQUE(user_id,id)
);
CREATE TABLE IF NOT EXISTS aw_integrations (
 id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 name TEXT NOT NULL,provider TEXT NOT NULL CHECK(provider IN ('resend','twilio','agent_webhook')),config JSONB NOT NULL DEFAULT '{}',
 credentials_encrypted TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'configured',last_activity_at TIMESTAMPTZ,last_error_code TEXT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),UNIQUE(user_id,id)
);
CREATE TABLE IF NOT EXISTS aw_segments (
 id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 name TEXT NOT NULL,rules JSONB NOT NULL DEFAULT '{}',created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),UNIQUE(user_id,id)
);
CREATE TABLE IF NOT EXISTS aw_consents (
 user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,deal_id UUID NOT NULL REFERENCES comm_deals(id) ON DELETE CASCADE,
 channel TEXT NOT NULL CHECK(channel IN ('whatsapp','email','sms')),status TEXT NOT NULL CHECK(status IN ('opted_in','opted_out')),
 evidence TEXT NOT NULL,updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),PRIMARY KEY(user_id,deal_id,channel)
);
CREATE TABLE IF NOT EXISTS aw_tags (
 user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,deal_id UUID NOT NULL REFERENCES comm_deals(id) ON DELETE CASCADE,
 tag TEXT NOT NULL,PRIMARY KEY(user_id,deal_id,tag)
);
CREATE TABLE IF NOT EXISTS aw_messages (
 id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,run_id UUID REFERENCES aw_runs(id),
 node_id TEXT NOT NULL,deal_id UUID REFERENCES comm_deals(id),order_id UUID REFERENCES tracking_orders(id),
 channel TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN ('dispatching','sent','delivered','read','failed','unknown','suppressed','simulated')),
 provider TEXT,provider_id TEXT,cost NUMERIC(12,4),currency VARCHAR(3),error_code TEXT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),sent_at TIMESTAMPTZ,delivered_at TIMESTAMPTZ,UNIQUE(run_id,node_id)
);
CREATE TABLE IF NOT EXISTS aw_campaigns (
 id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,name TEXT NOT NULL,
 product_id UUID,segment_id UUID,template_id UUID,flow_id UUID,channel TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','scheduled','sending','paused','completed','canceled')),
 scheduled_at TIMESTAMPTZ,time_zone TEXT NOT NULL DEFAULT 'America/Fortaleza',confirmed_at TIMESTAMPTZ,confirmed_by UUID REFERENCES users(id),
 max_recipients INT NOT NULL DEFAULT 100,cursor_id UUID,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 FOREIGN KEY(user_id,product_id) REFERENCES aw_products(user_id,id),FOREIGN KEY(user_id,segment_id) REFERENCES aw_segments(user_id,id),
 FOREIGN KEY(user_id,template_id) REFERENCES aw_templates(user_id,id),FOREIGN KEY(user_id,flow_id) REFERENCES aw_flows(user_id,id)
);
CREATE TABLE IF NOT EXISTS aw_campaign_recipients (
 campaign_id UUID NOT NULL REFERENCES aw_campaigns(id) ON DELETE CASCADE,deal_id UUID NOT NULL REFERENCES comm_deals(id),
 run_id UUID REFERENCES aw_runs(id),PRIMARY KEY(campaign_id,deal_id)
);
CREATE TABLE IF NOT EXISTS aw_links (
 token_hash TEXT PRIMARY KEY,user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,run_id UUID REFERENCES aw_runs(id),
 deal_id UUID REFERENCES comm_deals(id),channel TEXT,kind TEXT NOT NULL CHECK(kind IN ('click','unsubscribe')),url TEXT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),clicked_at TIMESTAMPTZ,expires_at TIMESTAMPTZ NOT NULL
);
CREATE TABLE IF NOT EXISTS aw_attributions (
 order_id UUID PRIMARY KEY REFERENCES tracking_orders(id) ON DELETE CASCADE,user_id UUID NOT NULL REFERENCES users(id),
 run_id UUID NOT NULL REFERENCES aw_runs(id),message_id UUID NOT NULL REFERENCES aw_messages(id),
 model TEXT NOT NULL CHECK(model='last_verified_click'),window_hours INT NOT NULL CHECK(window_hours BETWEEN 1 AND 720),
 recovered BOOLEAN NOT NULL DEFAULT FALSE,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS aw_events_pending ON aw_events(created_at) WHERE dispatched_at IS NULL;
CREATE INDEX IF NOT EXISTS aw_runs_owner_date ON aw_runs(user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS aw_messages_owner_date ON aw_messages(user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS aw_runs_order ON aw_runs(order_id,status);
-- Outbox transacional: alteração de pedido e evento são gravados juntos.
CREATE OR REPLACE FUNCTION aw_order_outbox() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE owner UUID; kind TEXT; product UUID; contact UUID;
BEGIN
 IF TG_OP='UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
 SELECT user_id INTO owner FROM tracking_sources WHERE id=NEW.source_id;
 IF owner IS NULL THEN RETURN NEW; END IF;
 SELECT CASE NEW.status WHEN 'approved' THEN 'payment.approved' WHEN 'pending' THEN 'checkout.started'
 WHEN 'abandoned' THEN 'checkout.abandoned' WHEN 'refused' THEN 'payment.failed' WHEN 'canceled' THEN 'payment.expired'
 WHEN 'refunded' THEN 'refund.completed' WHEN 'chargeback' THEN 'chargeback.received' END INTO kind;
 IF kind IS NULL THEN RETURN NEW; END IF;
 SELECT (ARRAY_AGG(id))[1] INTO product FROM aw_products WHERE user_id=owner AND source_id=NEW.source_id
 AND external_product_id=NEW.product_id AND active=TRUE HAVING COUNT(*)=1;
 SELECT (ARRAY_AGG(id))[1] INTO contact FROM comm_deals WHERE user_id=owner AND
 ((NULLIF(NEW.customer_email,'') IS NOT NULL AND LOWER(contact_email)=LOWER(NEW.customer_email)) OR
 (NULLIF(regexp_replace(NEW.customer_phone,'[^0-9]','','g'),'') IS NOT NULL AND regexp_replace(contact_phone,'[^0-9]','','g')=regexp_replace(NEW.customer_phone,'[^0-9]','','g'))) HAVING COUNT(*)=1;
 INSERT INTO aw_events(user_id,source_id,external_id,event_type,order_id,deal_id,product_id,payload)
 VALUES(owner,NEW.source_id,'order:'||NEW.id::text||':'||NEW.status,kind,NEW.id,contact,product,
 jsonb_build_object('status',NEW.status,'value',NEW.gross_value,'currency',NEW.currency,'payment_method',NEW.payment_method))
 ON CONFLICT(user_id,external_id,event_type) DO NOTHING;
 RETURN NEW;
END;$$;
DROP TRIGGER IF EXISTS aw_order_outbox_trigger ON tracking_orders;
CREATE TRIGGER aw_order_outbox_trigger AFTER INSERT OR UPDATE OF status ON tracking_orders FOR EACH ROW EXECUTE FUNCTION aw_order_outbox();
-- Link sessions are independent per outgoing message, never matched by time alone.
ALTER TABLE aw_links ADD COLUMN IF NOT EXISTS tracking_id UUID UNIQUE;
ALTER TABLE aw_links ADD COLUMN IF NOT EXISTS message_id UUID REFERENCES aw_messages(id);

CREATE OR REPLACE FUNCTION aw_version_immutable() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Published workflow versions are immutable'; END;$$;
DROP TRIGGER IF EXISTS aw_version_immutable_trigger ON aw_versions;
CREATE TRIGGER aw_version_immutable_trigger BEFORE UPDATE ON aw_versions FOR EACH ROW EXECUTE FUNCTION aw_version_immutable();
CREATE TABLE IF NOT EXISTS aw_suppressions (
 user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 channel TEXT NOT NULL CHECK(channel IN ('whatsapp','email','sms')),
 destination_hash TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 PRIMARY KEY(user_id,channel,destination_hash)
);
