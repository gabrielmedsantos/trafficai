// ==============================
// TrafficAI — Persona (aba "Persona" de Vendas)
// 1) Idade × gênero de quem viu/clicou/comprou, pela Meta (breakdowns age,gender).
// 2) Respostas do quiz que mais convertem: para cada pergunta de múltipla
//    escolha, quantas pessoas escolheram cada opção e quantas pagaram.
// Dados pessoais (nome, e-mail, telefone, dedicatória) nunca entram.
// ==============================

import axios from 'axios';
import { query } from '../database/connection';
import { logger } from '../shared/logger';
import { decrypt } from '../shared/encryption';
import { quizSourceScope } from './quiz-sharing';
import { SourceCtx, getUserAdsToken, actId } from './sales-report.service';

const META_VERSION = 'v21.0';
const TZ = 'America/Sao_Paulo';

export interface DemoCell {
    age: string;
    gender: 'female' | 'male' | 'unknown';
    spend: number;
    impressions: number;
    clicks: number;
    checkouts: number;
    purchases: number;
}

export interface QuizOption { value: string; people: number; completed: number; paid: number }
export interface QuizQuestion { key: string; label: string; total: number; paid: number; options: QuizOption[] }

export interface PersonaReport {
    meta: { live: boolean; cells: DemoCell[] };
    quiz: { sessions: number; paid: number; questions: QuizQuestion[] };
}

/** Chaves com dado pessoal ou texto livre: nunca agregadas. */
const PRIVATE_KEYS = new Set([
    'name', 'nome', 'childname', 'child_name', 'email', 'phone', 'whatsapp', 'telefone', 'momname', 'responsavel',
    'special', 'dedicatoria', 'dedication', 'cpf', 'document', 'address', 'endereco', 'recoveryconsent',
]);
const KEY_LABEL: Record<string, string> = {
    age: 'Idade da criança', gender: 'Gênero', skin: 'Tom de pele', hairColor: 'Cor do cabelo', hairType: 'Tipo de cabelo',
    eyes: 'Olhos', moral: 'Ensinamento', setting: 'Cenário', temperament: 'Personalidade', preference: 'Preferência',
    commitment: 'Compromisso', discount: 'Quis desconto', colorir: 'Livro de colorir', expressa: 'Entrega expressa', extra: 'Adicional',
};
/** Pergunta só vale se tiver poucas opções (múltipla escolha) e gente suficiente. */
const MAX_OPTIONS = 14;
const MIN_ANSWERS = 5;

const num = (v: any) => Number(v) || 0;

function actionSum(list: any[] | undefined, types: string[]): number {
    if (!Array.isArray(list)) return 0;
    let best = 0;
    for (const t of types) best = Math.max(best, num(list.find((a: any) => a.action_type === t)?.value));
    return best;
}

async function metaDemographics(source: SourceCtx, since: string, until: string): Promise<{ live: boolean; cells: DemoCell[] }> {
    if (!source.meta_account_id) return { live: false, cells: [] };
    const token = await getUserAdsToken(source.user_id);
    if (!token) return { live: false, cells: [] };
    try {
        const r: any = await axios.get(`https://graph.facebook.com/${META_VERSION}/${actId(source.meta_account_id)}/insights`, {
            params: {
                level: 'account', breakdowns: 'age,gender', limit: 200, access_token: token,
                fields: 'spend,impressions,inline_link_clicks,actions',
                time_range: JSON.stringify({ since, until }),
            },
            timeout: 30000,
        });
        const cells: DemoCell[] = (r.data?.data || []).map((row: any) => ({
            age: String(row.age || 'Unknown'),
            gender: row.gender === 'female' || row.gender === 'male' ? row.gender : 'unknown',
            spend: num(row.spend),
            impressions: num(row.impressions),
            clicks: num(row.inline_link_clicks),
            checkouts: actionSum(row.actions, ['initiate_checkout', 'omni_initiated_checkout', 'offsite_conversion.fb_pixel_initiate_checkout']),
            purchases: actionSum(row.actions, ['purchase', 'omni_purchase', 'offsite_conversion.fb_pixel_purchase']),
        }));
        return { live: true, cells };
    } catch (err: any) {
        logger.warn('persona: idade/gênero da Meta falhou', { error: err.response?.data?.error?.message || err.message });
        return { live: false, cells: [] };
    }
}

/** Valor de resposta legível e agregável; null quando não serve (vazio, objeto, texto longo). */
export function answerValue(v: unknown): string | null {
    if (typeof v === 'boolean') return v ? 'Sim' : 'Não';
    if (typeof v === 'number' && Number.isFinite(v)) return String(v);
    if (typeof v !== 'string') return null;
    const s = v.trim();
    return s && s.length <= 60 ? s : null;
}

/** Agrega as respostas: [{answers, completed, paid}] → perguntas com opções ordenadas. */
export function aggregateAnswers(sessions: Array<{ answers: Record<string, unknown>; completed: boolean; paid: boolean }>): QuizQuestion[] {
    const byKey = new Map<string, Map<string, QuizOption>>();
    for (const s of sessions) {
        for (const [key, raw] of Object.entries(s.answers || {})) {
            if (PRIVATE_KEYS.has(key.toLowerCase())) continue;
            const values = Array.isArray(raw) ? raw : [raw];
            for (const v of new Set(values.map(answerValue).filter((x): x is string => !!x))) {
                const opts = byKey.get(key) || new Map<string, QuizOption>();
                const o = opts.get(v) || { value: v, people: 0, completed: 0, paid: 0 };
                o.people++; if (s.completed) o.completed++; if (s.paid) o.paid++;
                opts.set(v, o);
                byKey.set(key, opts);
            }
        }
    }
    const out: QuizQuestion[] = [];
    for (const [key, opts] of byKey) {
        const options = [...opts.values()].filter((o) => o.people >= 1);
        const total = options.reduce((t, o) => t + o.people, 0);
        if (options.length < 2 || options.length > MAX_OPTIONS || total < MIN_ANSWERS) continue;
        options.sort((a, b) => b.people - a.people);
        out.push({ key, label: KEY_LABEL[key] || key, total, paid: options.reduce((t, o) => t + o.paid, 0), options });
    }
    // Perguntas com mais compradores primeiro (são as que dizem mais sobre quem compra).
    return out.sort((a, b) => b.paid - a.paid || b.total - a.total);
}

async function quizAnswers(source: SourceCtx, since: string, until: string) {
    const rows = await query<any>(
        `SELECT s.answers_encrypted, s.completed_at IS NOT NULL AS completed, o.status = 'approved' AS paid
         FROM tracking_quiz_sessions s
         JOIN tracking_quiz_funnels f ON f.id = s.funnel_id
         LEFT JOIN tracking_orders o ON o.id = s.order_id
         WHERE ${quizSourceScope()}
           AND s.created_at >= ($2::date::timestamp AT TIME ZONE '${TZ}')
           AND s.created_at < (($3::date + 1)::timestamp AT TIME ZONE '${TZ}')
         ORDER BY s.created_at DESC LIMIT 20000`,
        [source.id, since, until]
    );
    const sessions: Array<{ answers: Record<string, unknown>; completed: boolean; paid: boolean }> = [];
    for (const r of rows) {
        try { sessions.push({ answers: JSON.parse(decrypt(r.answers_encrypted)) || {}, completed: !!r.completed, paid: !!r.paid }); }
        catch { /* sessão com resposta ilegível: ignora */ }
    }
    return { sessions: sessions.length, paid: sessions.filter((s) => s.paid).length, questions: aggregateAnswers(sessions) };
}

export async function buildPersona(source: SourceCtx, since: string, until: string): Promise<PersonaReport> {
    const [meta, quiz] = await Promise.all([
        metaDemographics(source, since, until),
        quizAnswers(source, since, until).catch((err) => {
            logger.warn('persona: respostas do quiz indisponíveis', { error: err.message });
            return { sessions: 0, paid: 0, questions: [] as QuizQuestion[] };
        }),
    ]);
    return { meta, quiz };
}
