-- Adição local, ainda não aplicada em produção.
ALTER TABLE aw_campaigns ADD COLUMN IF NOT EXISTS version INT;
ALTER TABLE aw_campaigns ADD COLUMN IF NOT EXISTS rules_snapshot JSONB;
ALTER TABLE aw_campaigns ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ;
ALTER TABLE aw_campaigns ADD COLUMN IF NOT EXISTS finished_at TIMESTAMPTZ;
ALTER TABLE aw_campaign_recipients ADD COLUMN IF NOT EXISTS state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','enrolled','skipped'));
ALTER TABLE aw_campaign_recipients ADD COLUMN IF NOT EXISTS reason TEXT;
CREATE TABLE IF NOT EXISTS aw_enrollments (
 id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),user_id UUID NOT NULL REFERENCES users(id),
 flow_id UUID NOT NULL REFERENCES aw_flows(id),version INT NOT NULL,deal_id UUID NOT NULL REFERENCES comm_deals(id),
 recipient_key TEXT NOT NULL,run_id UUID REFERENCES aw_runs(id),created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 UNIQUE(flow_id,recipient_key),FOREIGN KEY(user_id,flow_id,version) REFERENCES aw_versions(user_id,flow_id,version)
);
CREATE INDEX IF NOT EXISTS aw_campaign_pending ON aw_campaign_recipients(campaign_id,state);
ALTER TABLE aw_messages ADD COLUMN IF NOT EXISTS integration_id UUID;
ALTER TABLE aw_messages ADD COLUMN IF NOT EXISTS opened_at TIMESTAMPTZ;
ALTER TABLE aw_messages ADD COLUMN IF NOT EXISTS clicked_at TIMESTAMPTZ;
ALTER TABLE aw_messages ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;
CREATE TABLE IF NOT EXISTS aw_receipts (
 integration_id UUID NOT NULL,external_id TEXT NOT NULL,provider TEXT NOT NULL,kind TEXT NOT NULL,
 message_id UUID REFERENCES aw_messages(id),created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 PRIMARY KEY(integration_id,external_id,provider)
);
CREATE INDEX IF NOT EXISTS aw_messages_provider ON aw_messages(integration_id,provider_id);
CREATE TABLE IF NOT EXISTS aw_sender_limits (
 user_id UUID NOT NULL REFERENCES users(id),integration_id UUID NOT NULL,next_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 PRIMARY KEY(user_id,integration_id)
);
ALTER TABLE aw_receipts ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id);
ALTER TABLE aw_receipts ADD COLUMN IF NOT EXISTS provider_id TEXT;
ALTER TABLE aw_receipts ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ;
ALTER TABLE aw_templates ADD COLUMN IF NOT EXISTS preheader TEXT NOT NULL DEFAULT '';
ALTER TABLE aw_integrations DROP CONSTRAINT IF EXISTS aw_integrations_provider_check;
ALTER TABLE aw_integrations ADD CONSTRAINT aw_integrations_provider_check CHECK(provider IN ('resend','twilio','agent_webhook','webhook'));
CREATE TABLE IF NOT EXISTS aw_external_intents (
 run_id UUID NOT NULL REFERENCES aw_runs(id),node_id TEXT NOT NULL,kind TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('prepared','completed','unknown','failed')),
 output JSONB NOT NULL DEFAULT '{}',error_code TEXT,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 PRIMARY KEY(run_id,node_id)
);
ALTER TABLE aw_templates ADD COLUMN IF NOT EXISTS parameters JSONB NOT NULL DEFAULT '[]';
-- Ofertas ficam no produto existente; nenhuma tabela paralela de vendas/contatos.
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
 SELECT (ARRAY_AGG(p.id))[1] INTO product FROM aw_products p WHERE p.user_id=owner AND p.source_id=NEW.source_id AND p.active=TRUE
 AND (p.external_product_id=NEW.product_id OR EXISTS(SELECT 1 FROM jsonb_array_elements(p.offers) o WHERE o->>'external_product_id'=NEW.product_id)) HAVING COUNT(*)=1;
 SELECT (ARRAY_AGG(id))[1] INTO contact FROM comm_deals WHERE user_id=owner AND
 ((NULLIF(NEW.customer_email,'') IS NOT NULL AND LOWER(contact_email)=LOWER(NEW.customer_email)) OR
 (NULLIF(regexp_replace(NEW.customer_phone,'[^0-9]','','g'),'') IS NOT NULL AND regexp_replace(contact_phone,'[^0-9]','','g')=regexp_replace(NEW.customer_phone,'[^0-9]','','g'))) HAVING COUNT(*)=1;
 INSERT INTO aw_events(user_id,source_id,external_id,event_type,order_id,deal_id,product_id,payload)
 VALUES(owner,NEW.source_id,'order:'||NEW.id::text||':'||NEW.status,kind,NEW.id,contact,product,jsonb_build_object('status',NEW.status,'value',NEW.gross_value,'currency',NEW.currency,'payment_method',NEW.payment_method))
 ON CONFLICT(user_id,external_id,event_type) DO NOTHING;
 RETURN NEW;
END;$$;
ALTER TABLE aw_jobs ADD COLUMN IF NOT EXISTS failure_count INT NOT NULL DEFAULT 0;
ALTER TABLE aw_messages ADD COLUMN IF NOT EXISTS provider_reference JSONB NOT NULL DEFAULT '{}';
ALTER TABLE aw_messages ADD COLUMN IF NOT EXISTS receipt_checked_at TIMESTAMPTZ;
ALTER TABLE aw_messages ADD COLUMN IF NOT EXISTS receipt_error TEXT;
