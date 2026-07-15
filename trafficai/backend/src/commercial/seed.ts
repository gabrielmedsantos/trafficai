// ==============================
// TrafficAI — Commercial: Seed Factory
// Gera dados mockados realistas pra alimentar o frontend na Fase 2.
// Uso: npm run seed:commercial -- --user-id=<uuid> [--client-id=<uuid>] [--reset]
// ==============================

import { Pool } from 'pg';
import { randomUUID } from 'crypto';

// Self-contained: instancia o pool aqui pra nao depender de outros modulos
// (permite rodar standalone via `node` no container de producao).
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL?.includes('sslmode=disable')
        ? false
        : { rejectUnauthorized: false },
});

async function query<T = unknown>(text: string, params?: unknown[]): Promise<T[]> {
    const res = await pool.query(text, params);
    return res.rows as T[];
}

// ----- CONFIG -----

const PIPELINE_NAME = 'Funil Comercial — Demo';
const STAGES = [
    { name: 'NOVO', color: '#94a3b8', stage_type: 'incoming' as const, win_probability: 5 },
    { name: 'QUALIFICAÇÃO', color: '#60a5fa', stage_type: 'normal' as const, win_probability: 20 },
    { name: 'PROPOSTA ENVIADA', color: '#a78bfa', stage_type: 'normal' as const, win_probability: 40 },
    { name: 'NEGOCIAÇÃO', color: '#f59e0b', stage_type: 'normal' as const, win_probability: 60 },
    { name: 'AGUARDANDO PAGAMENTO', color: '#fbbf24', stage_type: 'normal' as const, win_probability: 85 },
    { name: 'GANHO', color: '#10b981', stage_type: 'won' as const, win_probability: 100 },
    { name: 'PERDIDO', color: '#ef4444', stage_type: 'lost' as const, win_probability: 0 },
];

const SALESPEOPLE = [
    { name: 'Bertran Maia', role: 'closer' as const, color: '#8b5cf6', goal: 50000 },
    { name: 'Érika Beserra', role: 'closer' as const, color: '#ec4899', goal: 50000 },
    { name: 'Alan Oliveira', role: 'sdr' as const, color: '#06b6d4', goal: 30000 },
    { name: 'Kauã Souza', role: 'sdr' as const, color: '#10b981', goal: 30000 },
];

const LEAD_SOURCES = [
    { name: 'WhatsApp Principal', type: 'whatsapp_number' as const, identifier: '+5585999990000', color: '#10b981' },
    { name: 'Instagram Ads', type: 'campaign' as const, identifier: 'ig_ads_solar', color: '#ec4899' },
    { name: 'Google Ads', type: 'campaign' as const, identifier: 'g_ads_solar', color: '#3b82f6' },
    { name: 'Indicação', type: 'referral' as const, identifier: null, color: '#f59e0b' },
    { name: 'Orgânico', type: 'organic' as const, identifier: null, color: '#94a3b8' },
];

const CONTACT_NAMES = [
    'Maria Silva', 'João Santos', 'Ana Pereira', 'Carlos Mendes', 'Beatriz Lima',
    'Rafael Costa', 'Juliana Oliveira', 'Pedro Almeida', 'Fernanda Rocha', 'Lucas Ferreira',
    'Camila Souza', 'Bruno Carvalho', 'Patricia Ribeiro', 'Marcos Andrade', 'Larissa Gomes',
    'Thiago Barbosa', 'Renata Cardoso', 'Diego Nunes', 'Vanessa Martins', 'Felipe Cavalcante',
];

const DEAL_TITLES = [
    'Sistema fotovoltaico residencial 5kWp',
    'Sistema fotovoltaico comercial 12kWp',
    'Sistema fotovoltaico residencial 8kWp',
    'Geração distribuída — fazenda',
    'Sistema híbrido com bateria',
    'Carport solar 6kWp',
    'Sistema rural 20kWp',
    'Ampliação sistema existente',
];

const DEAL_VALUES = [7000, 8500, 10800, 12800, 14580, 16740, 18450, 22680, 25000, 31320];

// ----- HELPERS -----

function pick<T>(arr: T[]): T {
    return arr[Math.floor(Math.random() * arr.length)]!;
}

function randInt(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomPhone(): string {
    return `+5585${randInt(900000000, 999999999)}`;
}

function daysAgo(days: number, jitterHours = 12): Date {
    const d = new Date();
    d.setDate(d.getDate() - days);
    d.setHours(d.getHours() - randInt(-jitterHours, jitterHours));
    return d;
}

function weightedDistribution(total: number, weights: number[]): number[] {
    const sum = weights.reduce((a, b) => a + b, 0);
    const out = weights.map(w => Math.floor((w / sum) * total));
    // ajusta pra somar exatamente total
    const diff = total - out.reduce((a, b) => a + b, 0);
    out[0] = (out[0] ?? 0) + diff;
    return out;
}

// ----- ARG PARSING -----

interface SeedArgs {
    userId: string;
    clientId: string | null;
    reset: boolean;
}

function parseArgs(): SeedArgs {
    const args = process.argv.slice(2);
    const get = (key: string) => {
        const arg = args.find(a => a.startsWith(`--${key}=`));
        return arg ? arg.slice(key.length + 3) : undefined;
    };
    const userId = get('user-id');
    if (!userId) {
        throw new Error('--user-id=<uuid> é obrigatório');
    }
    return {
        userId,
        clientId: get('client-id') ?? null,
        reset: args.includes('--reset'),
    };
}

// ----- SEED LOGIC -----

async function reset(userId: string): Promise<void> {
    console.log('🧹 Limpando dados comerciais existentes do user', userId);
    // ON DELETE CASCADE faz o resto, mas explicitamos a ordem das tabelas-pai
    await query(`DELETE FROM comm_share_links WHERE user_id = $1`, [userId]);
    await query(`DELETE FROM comm_tasks WHERE user_id = $1`, [userId]);
    await query(`DELETE FROM comm_messages WHERE user_id = $1`, [userId]);
    await query(`DELETE FROM comm_conversations WHERE user_id = $1`, [userId]);
    await query(`DELETE FROM comm_deal_stage_history WHERE user_id = $1`, [userId]);
    await query(`DELETE FROM comm_deals WHERE user_id = $1`, [userId]);
    await query(`DELETE FROM comm_pipelines WHERE user_id = $1`, [userId]);
    await query(`DELETE FROM comm_lead_sources WHERE user_id = $1`, [userId]);
    await query(`DELETE FROM comm_salespeople WHERE user_id = $1`, [userId]);
    await query(`DELETE FROM comm_integrations WHERE user_id = $1`, [userId]);
    await query(`DELETE FROM comm_daily_metrics WHERE user_id = $1`, [userId]);
}

async function seed(args: SeedArgs): Promise<void> {
    const { userId, clientId } = args;

    if (args.reset) await reset(userId);

    // ----- Pipeline + stages -----
    console.log('📊 Criando pipeline + stages...');
    const pipelineId = randomUUID();
    await query(
        `INSERT INTO comm_pipelines (id, user_id, client_id, name, is_main, position, external_source)
         VALUES ($1,$2,$3,$4,true,0,'manual')`,
        [pipelineId, userId, clientId, PIPELINE_NAME]
    );

    const stageIds: Record<string, string> = {};
    for (let i = 0; i < STAGES.length; i++) {
        const s = STAGES[i]!;
        const id = randomUUID();
        stageIds[s.name] = id;
        await query(
            `INSERT INTO comm_pipeline_stages (id, pipeline_id, name, position, color, win_probability, stage_type, stuck_threshold_days)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
            [id, pipelineId, s.name, (i + 1) * 10, s.color, s.win_probability, s.stage_type, 7]
        );
    }

    // ----- Salespeople -----
    console.log('👥 Criando vendedores...');
    const salespersonIds: string[] = [];
    for (const sp of SALESPEOPLE) {
        const id = randomUUID();
        salespersonIds.push(id);
        await query(
            `INSERT INTO comm_salespeople (id, user_id, client_id, name, role, monthly_goal_value, avatar_color, external_source)
             VALUES ($1,$2,$3,$4,$5,$6,$7,'manual')`,
            [id, userId, clientId, sp.name, sp.role, sp.goal, sp.color]
        );
    }

    // ----- Lead sources -----
    console.log('📥 Criando origens de lead...');
    const sourceIds: string[] = [];
    for (const src of LEAD_SOURCES) {
        const id = randomUUID();
        sourceIds.push(id);
        await query(
            `INSERT INTO comm_lead_sources (id, user_id, client_id, name, type, identifier, color)
             VALUES ($1,$2,$3,$4,$5,$6,$7)`,
            [id, userId, clientId, src.name, src.type, src.identifier, src.color]
        );
    }

    // ----- Deals -----
    console.log('💼 Criando deals...');
    const TOTAL_DEALS = 200;
    // distribuição realista (pirâmide do funil): muito no topo, pouco no fim
    const stageWeights = [40, 60, 35, 18, 8, 12, 27]; // NOVO, QUAL, PROPOSTA, NEGO, AG.PAG, GANHO, PERDIDO
    const distribution = weightedDistribution(TOTAL_DEALS, stageWeights);
    const stageNames = STAGES.map(s => s.name);

    const deals: Array<{ id: string; stageId: string; stageName: string; value: number; salespersonId: string; createdAt: Date }> = [];

    let dealIdx = 0;
    for (let stageIdx = 0; stageIdx < STAGES.length; stageIdx++) {
        const stageName = stageNames[stageIdx]!;
        const stageId = stageIds[stageName]!;
        const stageMeta = STAGES[stageIdx]!;
        const count = distribution[stageIdx]!;

        for (let j = 0; j < count; j++) {
            dealIdx++;
            const dealId = randomUUID();
            const value = pick(DEAL_VALUES);
            const salespersonId = pick(salespersonIds);
            const sourceId = pick(sourceIds);
            const contactName = pick(CONTACT_NAMES);
            const title = pick(DEAL_TITLES);
            const ageDays = randInt(1, 60);
            const createdAt = daysAgo(ageDays);
            const lastChange = daysAgo(randInt(0, Math.min(ageDays, 14)));

            const isClosed = stageMeta.stage_type === 'won' || stageMeta.stage_type === 'lost';
            const closedAt = isClosed ? lastChange : null;
            const status = stageMeta.stage_type === 'won' ? 'won' : stageMeta.stage_type === 'lost' ? 'lost' : 'open';
            const lossReason = status === 'lost' ? pick(['Sem orçamento', 'Optou por concorrente', 'Não achou viável', 'Sem retorno']) : null;

            await query(
                `INSERT INTO comm_deals (
                    id, user_id, client_id, pipeline_id, stage_id, salesperson_id, source_id,
                    contact_name, contact_phone, title, value, status, loss_reason,
                    last_stage_change_at, last_activity_at, created_at, closed_at, external_source
                ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,'manual')`,
                [dealId, userId, clientId, pipelineId, stageId, salespersonId, sourceId,
                    contactName, randomPhone(), title, value, status, lossReason,
                    lastChange, lastChange, createdAt, closedAt]
            );

            deals.push({ id: dealId, stageId, stageName, value, salespersonId, createdAt });

            // Histórico: 'created' + alguns movimentos
            await query(
                `INSERT INTO comm_deal_stage_history (deal_id, user_id, from_stage_id, to_stage_id, moved_at, reason, deal_value_snapshot)
                 VALUES ($1,$2,NULL,$3,$4,'created',$5)`,
                [dealId, userId, stageIds[stageNames[0]!]!, createdAt, value]
            );

            // Movimentos intermediários (só pra estágios > 0)
            if (stageIdx > 0) {
                let prevDate = createdAt;
                let prevStageId = stageIds[stageNames[0]!]!;
                for (let k = 1; k <= stageIdx; k++) {
                    const moveDate = new Date(prevDate.getTime() + randInt(1, 7) * 24 * 60 * 60 * 1000);
                    if (moveDate > new Date()) break;
                    const targetStageId = stageIds[stageNames[k]!]!;
                    const dur = Math.floor((moveDate.getTime() - prevDate.getTime()) / 1000);
                    const reason = (k === stageIdx && isClosed) ? (status === 'won' ? 'won' : 'lost') : 'manual';
                    await query(
                        `INSERT INTO comm_deal_stage_history (deal_id, user_id, from_stage_id, to_stage_id, moved_at, reason, duration_in_from_seconds, deal_value_snapshot)
                         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
                        [dealId, userId, prevStageId, targetStageId, moveDate, reason, dur, value]
                    );
                    prevDate = moveDate;
                    prevStageId = targetStageId;
                }
            }
        }
    }
    console.log(`  ✅ ${dealIdx} deals criados`);

    // ----- Conversations + Messages -----
    console.log('💬 Criando conversas...');
    const TOTAL_CONVS = 150;
    let msgCount = 0;
    let convCount = 0;

    for (let i = 0; i < TOTAL_CONVS; i++) {
        const convId = randomUUID();
        const contactName = pick(CONTACT_NAMES);
        const phone = randomPhone();
        const salespersonId = Math.random() > 0.15 ? pick(salespersonIds) : null;
        const sourceId = pick(sourceIds);
        const linkedDeal = Math.random() > 0.6 ? pick(deals) : null;
        const ageDays = randInt(0, 30);
        const createdAt = daysAgo(ageDays);

        const incomingCount = randInt(1, 12);
        const outgoingCount = randInt(0, incomingCount + 2);
        const messageCount = incomingCount + outgoingCount;

        // tempo ate primeira resposta (mediana ~6min, alguns demoram)
        const firstResponseSeconds = randInt(30, Math.random() > 0.85 ? 86400 : 1800);
        const lastDirection = Math.random() > 0.4 ? 'in' : 'out';
        const lastMessageAt = new Date(createdAt.getTime() + randInt(0, 3) * 24 * 60 * 60 * 1000);
        const unansweredSince = lastDirection === 'in' ? lastMessageAt : null;
        const status = ageDays > 14 && Math.random() > 0.6 ? 'closed' : (lastDirection === 'in' ? 'pending' : 'open');

        await query(
            `INSERT INTO comm_conversations (
                id, user_id, client_id, deal_id, salesperson_id, source_id,
                channel, contact_name, contact_phone, status,
                message_count, incoming_count, outgoing_count,
                first_inbound_at, first_response_at, first_response_seconds,
                last_message_at, last_message_direction, unanswered_since,
                closed_at, created_at
            ) VALUES ($1,$2,$3,$4,$5,$6,'whatsapp',$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)`,
            [convId, userId, clientId, linkedDeal?.id ?? null, salespersonId, sourceId,
                contactName, phone, status,
                messageCount, incomingCount, outgoingCount,
                createdAt,
                outgoingCount > 0 ? new Date(createdAt.getTime() + firstResponseSeconds * 1000) : null,
                outgoingCount > 0 ? firstResponseSeconds : null,
                lastMessageAt, lastDirection, unansweredSince,
                status === 'closed' ? lastMessageAt : null, createdAt]
        );

        // mensagens (alterna in/out começando com in)
        let cur = createdAt;
        let inLeft = incomingCount;
        let outLeft = outgoingCount;
        let nextDir: 'in' | 'out' = 'in';
        const SAMPLE_TEXTS = {
            in: ['Olá, gostaria de saber sobre o sistema solar', 'Quanto custa pra residência?', 'Tem desconto à vista?', 'Vocês fazem em quanto tempo?', 'Posso parcelar?'],
            out: ['Olá! Bom dia 🌞 Tudo bem?', 'Claro, vou te enviar uma simulação', 'Temos sim, depende do consumo', 'Em até 30 dias após contrato', 'Parcelamos em até 84x sem juros'],
        };
        for (let m = 0; m < messageCount; m++) {
            if (nextDir === 'in' && inLeft === 0) nextDir = 'out';
            if (nextDir === 'out' && outLeft === 0) nextDir = 'in';
            cur = new Date(cur.getTime() + randInt(60, 3600) * 1000);
            await query(
                `INSERT INTO comm_messages (conversation_id, user_id, direction, content, type, sent_at, sender_salesperson_id)
                 VALUES ($1,$2,$3,$4,'text',$5,$6)`,
                [convId, userId, nextDir, pick(SAMPLE_TEXTS[nextDir]), cur, nextDir === 'out' ? salespersonId : null]
            );
            msgCount++;
            if (nextDir === 'in') inLeft--; else outLeft--;
            nextDir = nextDir === 'in' ? 'out' : 'in';
        }
        convCount++;
    }
    console.log(`  ✅ ${convCount} conversas, ${msgCount} mensagens`);

    // ----- Tasks -----
    console.log('📋 Criando tarefas...');
    const TOTAL_TASKS = 60;
    const TASK_TITLES = [
        'Ligar para confirmar visita',
        'Enviar proposta atualizada',
        'Follow-up cliente',
        'Agendar visita técnica',
        'Confirmar dados de contrato',
        'Reunião de fechamento',
    ];
    let taskCount = 0;
    for (let i = 0; i < TOTAL_TASKS; i++) {
        const dueOffset = randInt(-7, 14);
        const dueAt = daysAgo(-dueOffset);
        const isOverdue = dueOffset < 0 && Math.random() > 0.5;
        const isCompleted = Math.random() > 0.65;
        const status = isCompleted ? 'completed' : isOverdue ? 'overdue' : 'pending';
        await query(
            `INSERT INTO comm_tasks (user_id, client_id, deal_id, salesperson_id, title, type, due_at, completed_at, status, external_source)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'manual')`,
            [userId, clientId, Math.random() > 0.4 ? pick(deals).id : null, pick(salespersonIds),
                pick(TASK_TITLES), pick(['call', 'meeting', 'whatsapp', 'follow_up']), dueAt,
                isCompleted ? daysAgo(randInt(0, 5)) : null, status]
        );
        taskCount++;
    }
    console.log(`  ✅ ${taskCount} tarefas`);

    console.log('\n✨ Seed comercial completo!');
    console.log(`   user_id: ${userId}`);
    if (clientId) console.log(`   client_id: ${clientId}`);
}

// ----- ENTRY -----

(async () => {
    try {
        const args = parseArgs();
        await seed(args);
    } catch (err) {
        console.error('❌ Seed falhou:', err);
        process.exit(1);
    } finally {
        await pool.end();
    }
})();
