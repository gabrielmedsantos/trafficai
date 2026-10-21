ALTER TABLE tracking_delivery_settings ADD COLUMN IF NOT EXISTS whatsapp_config JSONB NOT NULL DEFAULT '{}';
