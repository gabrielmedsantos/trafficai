-- ==============================
-- Enhance Alerts System for Ad Account Management
-- ==============================

-- Adiciona novos campos para alertas de contas
ALTER TABLE alerts
ADD COLUMN account_id UUID REFERENCES ad_accounts(id) ON DELETE SET NULL,
ADD COLUMN metric_threshold DECIMAL(12,4),
ADD COLUMN auto_generated BOOLEAN DEFAULT true,
ADD COLUMN acknowledged_at TIMESTAMPTZ,
ADD COLUMN resolved_at TIMESTAMPTZ;

-- Adiciona índices para performance
CREATE INDEX idx_alerts_account ON alerts(account_id);
CREATE INDEX idx_alerts_severity ON alerts(severity, created_at DESC);
CREATE INDEX idx_alerts_auto_generated ON alerts(auto_generated, is_read) WHERE auto_generated = true AND is_read = false;

-- Comentários sobre os novos campos
COMMENT ON COLUMN alerts.account_id IS 'Conta de anúncio relacionada ao alerta';
COMMENT ON COLUMN alerts.metric_threshold IS 'Limite que disparou o alerta';
COMMENT ON COLUMN alerts.auto_generated IS 'Se o alerta foi gerado automaticamente pelo sistema';
COMMENT ON COLUMN alerts.acknowledged_at IS 'Quando o gestor reconheceu o alerta';
COMMENT ON COLUMN alerts.resolved_at IS 'Quando o problema foi resolvido';

-- Tipos de alertas suportados:
-- BUDGET: Saldo acabando, orçamento atingido
-- PERFORMANCE: CPA alto, CTR baixo, ROAS baixo, conversões caindo
-- ACCOUNT: Conta restrita, pagamento rejeitado, limite de gastos
-- CREATIVE: Anúncio reprovado, baixa relevância
-- DELIVERY: Baixa entrega, público saturado
-- ANOMALY: Picos ou quedas anormais em métricas
