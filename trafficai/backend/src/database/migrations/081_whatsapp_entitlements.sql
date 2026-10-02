-- Quem pode usar a UazAPI (WhatsApp pago, roda na conta da Alfamax).
-- NULL = automático pelo plano (teste grátis: só Evolution; planos pagos: liberado).
-- TRUE/FALSE = decisão manual do admin do SaaS pra esse cliente.
ALTER TABLE user_subscriptions ADD COLUMN IF NOT EXISTS allow_uazapi BOOLEAN;
