DO $$
DECLARE
  new_pipeline_id UUID := gen_random_uuid();
  ws_id UUID := '51325f8a-0279-43c2-8482-085d34332473';
  s1 UUID := gen_random_uuid();
  s2 UUID := gen_random_uuid();
  s3 UUID := gen_random_uuid();
  s4 UUID := gen_random_uuid();
  s5 UUID := gen_random_uuid();
  s6 UUID := gen_random_uuid();
BEGIN
  INSERT INTO pipelines (id, workspace_id, name, default_stage_name, created_at, updated_at)
  VALUES (new_pipeline_id, ws_id, 'Pipeline Principal', 'Novo Lead', NOW(), NOW());

  INSERT INTO stages (id, pipeline_id, name, color, position, created_at, updated_at) VALUES
    (s1, new_pipeline_id, 'Contato Iniciado', '#60a5fa', 0, NOW(), NOW()),
    (s2, new_pipeline_id, 'Sem Resposta',     '#94a3b8', 1, NOW(), NOW()),
    (s3, new_pipeline_id, 'Respondeu',        '#a78bfa', 2, NOW(), NOW()),
    (s4, new_pipeline_id, 'Em Negociacao',    '#f59e0b', 3, NOW(), NOW()),
    (s5, new_pipeline_id, 'Depositou',        '#34d399', 4, NOW(), NOW()),
    (s6, new_pipeline_id, 'Perdido',          '#f87171', 5, NOW(), NOW());

  INSERT INTO pipeline_rules (id, pipeline_id, workspace_id, name, trigger, trigger_hours, from_stage_id, from_null_stage, to_stage_id, assign_strategy, assign_pool, is_active, created_at, updated_at)
  VALUES (gen_random_uuid(), new_pipeline_id, ws_id, 'Ao enviar um Template Mover', 'TEMPLATE_SENT', NULL, NULL, true, s1, NULL, NULL, true, NOW(), NOW());

  INSERT INTO pipeline_rules (id, pipeline_id, workspace_id, name, trigger, trigger_hours, from_stage_id, from_null_stage, to_stage_id, assign_strategy, assign_pool, is_active, created_at, updated_at)
  VALUES (gen_random_uuid(), new_pipeline_id, ws_id, 'Lead sem Resposta', 'NO_RESPONSE', 5, s1, false, s2, NULL, NULL, true, NOW(), NOW());

  RAISE NOTICE 'Concluido: pipeline_id = %', new_pipeline_id;
END;
$$;
