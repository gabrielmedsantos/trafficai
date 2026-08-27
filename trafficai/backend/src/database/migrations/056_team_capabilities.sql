-- Permissão de equipe por funcionalidade.
-- NULL = sem restrição (comportamento atual, preservado pra membros já existentes).
-- Array (mesmo vazio) = allow-list explícita definida por um admin.
ALTER TABLE users ADD COLUMN IF NOT EXISTS capabilities TEXT[];
