-- ==============================
-- Snapshots de relatórios PDF (HTML servido publicamente via token)
-- ==============================

CREATE TABLE IF NOT EXISTS report_pdf_snapshots (
    token VARCHAR(40) PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    account_id UUID NOT NULL REFERENCES ad_accounts(id) ON DELETE CASCADE,
    html TEXT NOT NULL,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    account_name VARCHAR(255) NOT NULL,
    view_count INT NOT NULL DEFAULT 0,
    last_viewed_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '90 days'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_report_pdf_snapshots_expires
    ON report_pdf_snapshots(expires_at);
