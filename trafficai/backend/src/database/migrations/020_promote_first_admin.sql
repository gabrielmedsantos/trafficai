-- ==============================
-- TrafficAI — Promove primeiro user para admin
-- Se ninguém for admin ainda, o user mais antigo é promovido.
-- Idempotente: seguro rodar múltiplas vezes.
-- ==============================

UPDATE users SET role = 'admin'
WHERE id = (
  SELECT id FROM users ORDER BY created_at ASC LIMIT 1
)
AND NOT EXISTS (SELECT 1 FROM users WHERE role = 'admin');
