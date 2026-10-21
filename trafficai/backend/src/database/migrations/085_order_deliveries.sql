CREATE TABLE IF NOT EXISTS tracking_delivery_settings (
 source_id UUID PRIMARY KEY REFERENCES tracking_sources(id) ON DELETE CASCADE,
 enabled BOOLEAN NOT NULL DEFAULT false,
 product_ids JSONB NOT NULL DEFAULT '[]',
 coloring_product_ids JSONB NOT NULL DEFAULT '[]',
 priority_product_ids JSONB NOT NULL DEFAULT '[]',
 funnel_slug TEXT NOT NULL DEFAULT 'mamae-quero-historinha',
 template_version TEXT NOT NULL DEFAULT 'v1'
);
CREATE TABLE IF NOT EXISTS tracking_order_deliveries (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 order_id UUID NOT NULL UNIQUE REFERENCES tracking_orders(id) ON DELETE CASCADE,
 source_id UUID NOT NULL REFERENCES tracking_sources(id) ON DELETE CASCADE,
 status TEXT NOT NULL CHECK(status IN ('queued','generating','ready','sending','partial','failed','delivered')),
 snapshot_encrypted TEXT NOT NULL,
 template_version TEXT NOT NULL,
 files JSONB NOT NULL DEFAULT '[]',
 generation_id UUID NOT NULL DEFAULT gen_random_uuid(),
 attempt INTEGER NOT NULL DEFAULT 1,
 last_error TEXT,
 delivered_at TIMESTAMPTZ,
 delivered_by UUID REFERENCES users(id),
 completion_method TEXT,
 cleanup_pending BOOLEAN NOT NULL DEFAULT false,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS tracking_delivery_queue ON tracking_order_deliveries(created_at) WHERE status='queued';
CREATE INDEX IF NOT EXISTS tracking_delivery_source ON tracking_order_deliveries(source_id,updated_at DESC);
CREATE TABLE IF NOT EXISTS tracking_delivery_history (
 id BIGSERIAL PRIMARY KEY,
 delivery_id UUID NOT NULL REFERENCES tracking_order_deliveries(id) ON DELETE CASCADE,
 actor_id UUID REFERENCES users(id),
 action TEXT NOT NULL,
 details JSONB NOT NULL DEFAULT '{}',
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
