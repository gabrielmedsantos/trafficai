-- ==============================
-- Daily Report Approval Workflow
-- Cron envia relatório pro DONO via WhatsApp com link;
-- aprovação encaminha pro cliente final.
-- ==============================

ALTER TABLE notification_settings
  ADD COLUMN IF NOT EXISTS owner_whatsapp TEXT,
  ADD COLUMN IF NOT EXISTS daily_report_approval_required BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS daily_report_approvals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    account_id UUID NOT NULL REFERENCES ad_accounts(id) ON DELETE CASCADE,
    report_date DATE NOT NULL,
    client_name TEXT,
    client_phone TEXT NOT NULL,
    message_text TEXT NOT NULL,
    approval_token TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'pending',
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    approved_at TIMESTAMPTZ,
    sent_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_dra_user_status ON daily_report_approvals (user_id, status);
CREATE INDEX IF NOT EXISTS idx_dra_token ON daily_report_approvals (approval_token);
CREATE INDEX IF NOT EXISTS idx_dra_created ON daily_report_approvals (created_at DESC);
