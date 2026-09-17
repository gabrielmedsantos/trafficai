-- Labels sincronizadas por instância Evolution (id -> nome), pra resolver
-- labelId em labels.association e alimentar o seletor de "Nova regra" no
-- frontend (trigger_type='whatsapp_label').
CREATE TABLE IF NOT EXISTS evolution_labels (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    integration_id UUID NOT NULL REFERENCES comm_integrations(id) ON DELETE CASCADE,
    label_id VARCHAR(50) NOT NULL,
    name VARCHAR(120) NOT NULL,
    color INT,
    deleted BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(integration_id, label_id)
);

-- Mapeamento @lid -> telefone real, populado só quando a Evolution/Baileys
-- expõe o JID alternativo (remoteJidAlt/participantAlt) junto de um @lid —
-- nem sempre disponível (depende do WhatsApp, não do nosso código). Sem
-- entrada aqui, um evento de label num chat @lid não tem como ser resolvido
-- pra telefone e é descartado (ver diagnóstico evolution_lid_unresolved).
CREATE TABLE IF NOT EXISTS evolution_lid_phone_map (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    integration_id UUID NOT NULL REFERENCES comm_integrations(id) ON DELETE CASCADE,
    lid VARCHAR(50) NOT NULL,
    phone VARCHAR(30) NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(integration_id, lid)
);
