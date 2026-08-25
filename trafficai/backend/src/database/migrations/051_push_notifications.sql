-- ==============================
-- TrafficAI — Web Push Notifications
-- Assinaturas de push por dispositivo (PWA instalado, browser desktop, etc.)
-- ==============================

CREATE TABLE push_subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_push_subscriptions_user ON push_subscriptions(user_id);

ALTER TABLE notification_settings ADD COLUMN IF NOT EXISTS push_enabled BOOLEAN DEFAULT false;
