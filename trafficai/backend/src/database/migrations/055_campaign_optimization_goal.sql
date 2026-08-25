-- ==============================
-- TrafficAI — Optimization goal / destination da campanha
-- Usado pra rotular corretamente o "resultado" de campanhas cujo objetivo
-- de otimização é mais específico que o objective genérico do Meta (ex:
-- "Visitas ao perfil" em campanhas de Tráfego apontando pro Instagram).
-- ==============================

ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS optimization_goal VARCHAR(100),
  ADD COLUMN IF NOT EXISTS destination_type VARCHAR(100);
