// ==============================
// TrafficAI — Daily WhatsApp Text Report Service
// Envia resumo diário de métricas via WhatsApp (texto, não link)
// ==============================

import axios from 'axios';
import crypto from 'crypto';
import { query } from '../database/connection';
import { metaService } from '../meta/meta.service';
import { logger } from '../shared/logger';

interface AccountWithSettings {
    id: string;
    user_id: string;
    account_name: string;
    meta_account_id: string;
    client_name: string | null;
    client_phone: string | null;
    // template custom (NULL = usa default)
    daily_whatsapp_template?: string | null;
    // notification_settings
    whatsapp_provider: 'uazapi' | 'evolution' | 'zapi' | null;
    uazapi_url: string | null;
    uazapi_token: string | null;
    evolution_api_url: string | null;
    evolution_api_key: string | null;
    evolution_instance: string | null;
    zapi_instance_id: string | null;
    zapi_token: string | null;
    zapi_client_token: string | null;
    // approval workflow
    owner_whatsapp: string | null;
    daily_report_approval_required: boolean | null;
}

// ─── Template variables disponíveis ────────────────────────────────────────
// Expostas pra UI mostrar autocomplete + lista de placeholders válidos.
export const TEMPLATE_VARIABLES = [
    { key: 'client_name',         label: 'Nome do cliente',                example: 'CLIENTE ABC' },
    { key: 'greeting',             label: 'Saudação (Bom dia / Boa tarde)', example: 'Bom dia' },
    { key: 'today_label',          label: 'Data de ontem (DD/MM)',          example: '28/06' },
    { key: 'today_spend',          label: 'Investimento ontem',             example: 'R$ 1.234,56' },
    { key: 'today_impressions',    label: 'Impressões ontem',                example: '12.345' },
    { key: 'today_leads',          label: 'Leads/conversões ontem',          example: '23' },
    { key: 'today_cpl',            label: 'Custo por lead ontem',            example: 'R$ 53,67' },
    { key: 'today_action_label',   label: 'Label da ação (lead/compra)',     example: 'lead' },
    { key: 'today_breakdown_block', label: 'Detalhamento por objetivo (ontem) — só aparece quando há mais de 1', example: '📌 Por objetivo:\n• Conversas iniciadas: 103 · R$ 2,90/conversa\n• Visitas ao perfil: 45 · R$ 1,10/visita' },
    { key: 'last7_label',          label: 'Período últimos 7 dias',          example: '22/06 a 28/06' },
    { key: 'last7_spend',          label: 'Investimento últimos 7d',         example: 'R$ 8.500,00' },
    { key: 'last7_impressions',    label: 'Impressões últimos 7d',           example: '85.300' },
    { key: 'last7_leads',          label: 'Leads últimos 7d',                example: '142' },
    { key: 'last7_cpl',            label: 'CPL últimos 7d',                  example: 'R$ 59,86' },
    { key: 'last7_action_label',   label: 'Label da ação (últimos 7d)',      example: 'lead' },
    { key: 'last7_breakdown_block', label: 'Detalhamento por objetivo (7d) — só aparece quando há mais de 1', example: '📌 Por objetivo:\n• Conversas iniciadas: 428 · R$ 3,42/conversa\n• Visitas ao perfil: 180 · R$ 1,05/visita' },
    { key: 'month_label',          label: 'Período do mês',                  example: '01/06 a 28/06' },
    { key: 'month_spend',          label: 'Investimento do mês',             example: 'R$ 24.180,00' },
    { key: 'month_impressions',    label: 'Impressões do mês',               example: '320.500' },
    { key: 'month_leads',          label: 'Leads do mês',                    example: '412' },
    { key: 'month_cpl',            label: 'CPL do mês',                      example: 'R$ 58,69' },
    { key: 'month_action_label',   label: 'Label da ação (mês)',             example: 'lead' },
    { key: 'month_breakdown_block', label: 'Detalhamento por objetivo (mês) — só aparece quando há mais de 1', example: '📌 Por objetivo:\n• Conversas iniciadas: 1.017 · R$ 4,05/conversa\n• Visitas ao perfil: 320 · R$ 0,95/visita' },
    { key: 'active_ads',           label: 'Anúncios ativos / em análise',    example: '8' },
    { key: 'top_ads_block',        label: 'Bloco top criativos (ontem)',    example: '🥇 ADS-GERAL IA\n   💰 R$ 141,66 · 57 conv. · R$ 2,46/conv\n\n🥈 ADS-NIUVS\n   💰 R$ 136,00 · 34 conv. · R$ 4,00/conv' },
    { key: 'top_ads_block_7d',     label: 'Bloco top criativos (7 dias)',   example: '🥇 ADS-GERAL IA · R$ 990/7d · 380 conv\n🥈 ADS-NIUVS · R$ 950/7d · 240 conv' },
    { key: 'ads_count',            label: 'Total de anúncios no relatório', example: '5' },
    { key: 'report_link',          label: 'Link do relatório visual completo (ontem)', example: 'https://api.alfamaxdigital.com.br/api/v1/r/pdf/abc123' },
    { key: 'report_link_7d',       label: 'Link do relatório visual (últimos 7 dias)', example: 'https://api.alfamaxdigital.com.br/api/v1/r/pdf/xyz456' },
] as const;

/** Template default — usado quando daily_whatsapp_template é NULL. */
export function getTemplateByName(name?: string): string {
    switch (name) {
        case 'executive':   return TPL_EXECUTIVE;
        case 'detailed':    return TPL_DETAILED;
        case 'whatsapp_focus': return TPL_WHATSAPP_FOCUS;
        case 'per_creative': return TPL_PER_CREATIVE;
        default:            return getDefaultTemplate();
    }
}

const TPL_PER_CREATIVE = [
    '{greeting} *{client_name}*!',
    '',
    '📅 Resumo de ontem ({today_label}):',
    '',
    '💰 Investimento: {today_spend}',
    '📊 {today_leads} {today_action_label} · {today_cpl}/{today_action_label_singular}',
    '⚡️ Impressões: {today_impressions}',
    '',
    '━━━ 🎯 CRIATIVOS ATIVOS ━━━',
    '{top_ads_block}',
    '',
    '━━━ 📈 ÚLTIMOS 7 DIAS ━━━',
    '💰 {last7_spend} · 📊 {last7_leads} {last7_action_label}',
    '',
    '━━━ 📅 MÊS ({month_label}) ━━━',
    '💰 {month_spend} · 📊 {month_leads} {month_action_label}',
    '',
    '📄 Relatório visual completo:',
    '{report_link}',
].join('\n');

const TPL_EXECUTIVE = [
    '{greeting} *{client_name}*',
    '',
    '📅 {today_label} — resumo executivo:',
    '',
    '💰 R$ {today_spend} · 📊 {today_leads} {today_action_label} · R$ {today_cpl}/{today_action_label_singular}',
    '',
    '📈 Últimos 7 dias: R$ {last7d_spend} → {last7d_leads} {last7d_action_label}',
    '📊 No mês: R$ {month_spend} → {month_leads} {month_action_label}',
].join('\n');

const TPL_DETAILED = [
    '{greeting} *{client_name}*, aqui está o relatório completo:',
    '',
    '━━━ 📅 ONTEM ({today_label}) ━━━',
    '💰 Investimento: R$ {today_spend}',
    '⚡️ Impressões: {today_impressions}',
    '🎯 {today_action_label}: {today_leads}',
    '💸 Custo por {today_action_label_singular}: R$ {today_cpl}',
    '',
    '━━━ 📊 ÚLTIMOS 7 DIAS ({last7d_label}) ━━━',
    '💰 R$ {last7d_spend} · 📊 {last7d_leads} · R$ {last7d_cpl}/lead',
    '',
    '━━━ 📆 MÊS ({month_label}) ━━━',
    '💰 R$ {month_spend} · 📊 {month_leads} · R$ {month_cpl}/lead',
].join('\n');

const TPL_WHATSAPP_FOCUS = [
    '{greeting} *{client_name}*!',
    '',
    '💬 Focados em conversas via WhatsApp:',
    '',
    '📅 Ontem: *{today_leads}* conversas iniciadas',
    '💰 Investimento: R$ {today_spend}',
    '💸 Custo por conversa: R$ {today_cpl}',
    '',
    '📊 Últimos 7 dias: {last7d_leads} conversas · R$ {last7d_cpl}/conversa',
    '📈 No mês: {month_leads} conversas · R$ {month_cpl}/conversa',
].join('\n');

export function getDefaultTemplate(): string {
    return [
        '{greeting} *{client_name}*, tudo bem?',
        '',
        'Resumo de Ontem:',
        '> [{today_label}]',
        '',
        '💰 Investimento de {today_spend}',
        '⚡️ Impressões: {today_impressions}',
        '📊 Total de {today_leads} {today_action_label}',
        '💰 Custo por {today_action_label} de {today_cpl}{today_breakdown_block}',
        '',
        'Resumo de nossas campanhas nos últimos 7 dias:',
        '> [{last7_label}]',
        '',
        '💰 Investimento de {last7_spend}',
        '⚡️ Impressões: {last7_impressions}',
        '📊 Total de {last7_leads} {last7_action_label}',
        '💰 Custo por {last7_action_label} de {last7_cpl}{last7_breakdown_block}',
        '',
        'Resumo desse mês:',
        '> [{month_label}]',
        '',
        '💰 Investimento de {month_spend}',
        '⚡️ Impressões: {month_impressions}',
        '📊 Total de {month_leads} {month_action_label}',
        '💰 Custo por {month_action_label} de {month_cpl}{month_breakdown_block}',
        '',
        '📄 Relatório visual completo:',
        '{report_link}',
    ].join('\n');
}

/** Renderiza um template substituindo {placeholders} pelos valores. */
export function renderTemplate(template: string, vars: Record<string, string | number>): string {
    return template.replace(/\{(\w+)\}/g, (match, key: string) => {
        if (Object.prototype.hasOwnProperty.call(vars, key)) {
            return String(vars[key]);
        }
        return match; // mantém {placeholder} desconhecido sem substituir
    });
}

/** Builda o dicionário de vars a partir das métricas — sem ler do banco. */
export interface AdRankRow {
    name: string;
    spend: number;
    conversions: number;
    cpa: number;
    action_label: string;
    impressions?: number;
}

/**
 * Formata TODOS os anúncios como se fossem campanhas separadas, cada um com sua linha.
 * Ordenado por spend desc. Sem truncar por número (só limite defensivo pra evitar msg >5k).
 */
export function formatTopAdsBlock(ads: AdRankRow[], variant: 'today' | 'week' = 'today'): string {
    if (!ads.length) return '_Sem dados de anúncios no período._';
    const fmtBRL = (v: number) => `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const MAX = 25; // limite defensivo — WhatsApp corta msgs muito longas
    return ads.slice(0, MAX).map((ad, i) => {
        const cpa = ad.cpa > 0 ? fmtBRL(ad.cpa) : '—';
        const actionSingular = ad.action_label.endsWith('s') ? ad.action_label.replace(/s$/, '') : ad.action_label;
        const cleanName = ad.name.length > 42 ? ad.name.slice(0, 39) + '…' : ad.name;
        // Formato compacto tipo "anúncio como campanha":
        //   *NOME*
        //   💰 R$ 141,66 · 📊 57 conv · R$ 2,46/conv
        return `*${i + 1}. ${cleanName}*\n   💰 ${fmtBRL(ad.spend)} · 📊 ${ad.conversions} ${ad.action_label.toLowerCase()} · ${cpa}/${actionSingular.toLowerCase()}`;
    }).join('\n\n') + (ads.length > MAX ? `\n\n_+${ads.length - MAX} outros anúncios..._` : '');
}

interface TemplateMetrics {
    spend: number;
    impressions: number;
    leads: number;
    cost_per_lead: number;
    primary_action_label: string;
    objective_breakdown?: { label: string; count: number; spend: number; cost_per: number }[];
}

/** Lista "• Label: N · R$ X/label" por objetivo — só retorna algo quando há mais de
 *  um resultado diferente no período (senão o {today_leads} normal já basta). */
function formatBreakdownBlock(groups: TemplateMetrics['objective_breakdown']): string {
    if (!groups || groups.length <= 1) return '';
    const fmtBRL = (v: number) => `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const lines = groups.map(g => {
        const singular = g.label.replace(/s$/, '').toLowerCase();
        return `• ${g.label}: ${g.count.toLocaleString('pt-BR')} · ${fmtBRL(g.cost_per)}/${singular}`;
    });
    // \n\n na frente pra colar no final da linha de CPL sem deixar espaço extra
    // quando vazio (conta com um objetivo só — maioria dos casos).
    return `\n\n📌 Por objetivo:\n${lines.join('\n')}`;
}

export function buildTemplateVars(data: {
    client_name: string;
    greeting: string;
    today: { metrics: TemplateMetrics; label: string };
    last7d: { metrics: TemplateMetrics; label: string };
    month: { metrics: TemplateMetrics; label: string };
    activeAds: number;
    topAdsToday?: AdRankRow[];
    topAds7d?: AdRankRow[];
    reportLink?: string;
    reportLink7d?: string;
}): Record<string, string | number> {
    const fmtBRL = (v: number) => `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const fmtNum = (v: number) => v.toLocaleString('pt-BR');
    const todaySingular = data.today.metrics.leads === 1 ? data.today.metrics.primary_action_label.replace(/s$/, '') : data.today.metrics.primary_action_label;

    return {
        client_name: data.client_name.toUpperCase(),
        greeting: data.greeting,
        // Today
        today_label: data.today.label,
        today_spend: fmtBRL(data.today.metrics.spend),
        today_impressions: fmtNum(data.today.metrics.impressions),
        today_leads: fmtNum(data.today.metrics.leads),
        today_cpl: fmtBRL(data.today.metrics.cost_per_lead),
        today_action_label: todaySingular,
        today_action_label_singular: data.today.metrics.primary_action_label.replace(/s$/, ''),
        today_breakdown_block: formatBreakdownBlock(data.today.metrics.objective_breakdown),
        // Last 7 days
        last7_label: data.last7d.label,
        last7_spend: fmtBRL(data.last7d.metrics.spend),
        last7_impressions: fmtNum(data.last7d.metrics.impressions),
        last7_leads: fmtNum(data.last7d.metrics.leads),
        last7_cpl: fmtBRL(data.last7d.metrics.cost_per_lead),
        last7_action_label: data.last7d.metrics.primary_action_label,
        last7_breakdown_block: formatBreakdownBlock(data.last7d.metrics.objective_breakdown),
        // Month
        month_label: data.month.label,
        month_spend: fmtBRL(data.month.metrics.spend),
        month_impressions: fmtNum(data.month.metrics.impressions),
        month_leads: fmtNum(data.month.metrics.leads),
        month_cpl: fmtBRL(data.month.metrics.cost_per_lead),
        month_action_label: data.month.metrics.primary_action_label,
        month_breakdown_block: formatBreakdownBlock(data.month.metrics.objective_breakdown),
        // Active ads
        active_ads: data.activeAds,
        // Top criativos
        top_ads_block: data.topAdsToday && data.topAdsToday.length > 0
            ? formatTopAdsBlock(data.topAdsToday, 'today')
            : '_Sem dados de criativos ontem._',
        top_ads_block_7d: data.topAds7d && data.topAds7d.length > 0
            ? formatTopAdsBlock(data.topAds7d, 'week')
            : '_Sem dados de criativos nos últimos 7 dias._',
        ads_count: (data.topAdsToday || []).length,
        report_link: data.reportLink || '',
        report_link_7d: data.reportLink7d || '',
    };
}

const PUBLIC_BASE_URL = process.env.PUBLIC_API_URL || 'https://api.alfamaxdigital.com.br';

/** Retorna a data de "ontem" em fuso de Brasília (BRT, UTC-3), formato YYYY-MM-DD. */
function yesterdayBRT(): string {
    const nowUtc = Date.now();
    const brtMs = nowUtc - 3 * 60 * 60 * 1000;
    const yesterdayBrt = new Date(brtMs - 24 * 60 * 60 * 1000);
    return yesterdayBrt.toISOString().slice(0, 10);
}

interface DayMetrics {
    spend: number;
    impressions: number;
    clicks: number;
    conversions: number;
    ctr: number;
    cpc: number;
    cpm: number;
    roas: number;
    cost_per_conversion: number;
    primary_action_label: string;
}

interface ObjectiveBreakdownGroup {
    label: string;
    count: number;
    spend: number;
    cost_per: number;
}

interface RangeMetrics {
    spend: number;
    impressions: number;
    leads: number;
    cost_per_lead: number;
    primary_action_label: string;
    /** Um grupo por resultado detectado (ex: "Conversas iniciadas" x "Visitas ao perfil").
     *  Só tem mais de 1 item quando a conta tem campanhas com objetivos/resultados diferentes. */
    objective_breakdown: ObjectiveBreakdownGroup[];
}

export class DailyWhatsAppService {

    /**
     * Roda a cada 15min — dispara relatório pra contas cujo horário UTC bate com o slot atual
     * e que ainda não enviaram hoje (controle por daily_whatsapp_last_sent_date).
     */
    async sendScheduledReports(): Promise<void> {
        const now = new Date();
        // Slot de 15min: arredonda pra baixo (ex: 14:33 → 14:30)
        const hh = String(now.getUTCHours()).padStart(2, '0');
        const mm = String(Math.floor(now.getUTCMinutes() / 15) * 15).padStart(2, '0');
        const slot = `${hh}:${mm}`;
        const todayStr = now.toISOString().slice(0, 10);

        let accounts: AccountWithSettings[];
        try {
            accounts = await query<AccountWithSettings>(`
                SELECT
                    a.id, a.user_id, a.account_name, a.meta_account_id,
                    rs.client_name, rs.client_phone,
                    rs.daily_whatsapp_template,
                    rs.report_template,
                    ns.whatsapp_provider,
                    ns.uazapi_url, ns.uazapi_token,
                    ns.evolution_api_url, ns.evolution_api_key, ns.evolution_instance,
                    ns.zapi_instance_id, ns.zapi_token, ns.zapi_client_token,
                    ns.owner_whatsapp, ns.daily_report_approval_required
                FROM ad_accounts a
                JOIN report_settings rs ON rs.account_id = a.id
                LEFT JOIN notification_settings ns ON ns.user_id = a.user_id
                WHERE a.is_client_active = true
                  AND rs.daily_whatsapp_enabled = true
                  AND rs.client_phone IS NOT NULL AND rs.client_phone <> ''
                  AND COALESCE(rs.daily_whatsapp_time, '11:15') = $1
                  AND (rs.daily_whatsapp_last_sent_date IS NULL OR rs.daily_whatsapp_last_sent_date < $2::DATE)
            `, [slot, todayStr]);
        } catch (err: any) {
            // tabela/coluna não criada ainda — silencia
            return;
        }

        if (!accounts.length) return;

        logger.info(`📱 Slot ${slot} UTC: ${accounts.length} relatório(s) WhatsApp pra enviar`);

        // Data reportada: ONTEM em BRT (relatório diário sempre fala do dia anterior em horário Brasília)
        const dateStr = yesterdayBRT();

        for (const acc of accounts) {
            if (acc.client_phone!.startsWith('https://chat.whatsapp.com/')) {
                logger.warn(`daily-whatsapp: ${acc.account_name} usa link convite — use ID do grupo (xxx@g.us) ou número`);
                continue;
            }
            try {
                const message = await this.buildFullReport(acc, dateStr);
                if (acc.daily_report_approval_required && acc.owner_whatsapp) {
                    await this.queueForApproval(acc, message, dateStr);
                    logger.info(`📤 Relatório p/ aprovação: ${acc.account_name} → dono`);
                } else {
                    await this.send(acc, acc.client_phone!, message);
                    logger.info(`✅ Relatório enviado: ${acc.account_name} → ${acc.client_phone}`);
                }
                await query(
                    `UPDATE report_settings SET daily_whatsapp_last_sent_date = $1::DATE WHERE account_id = $2`,
                    [todayStr, acc.id]
                );
            } catch (err: any) {
                logger.error(`Falha relatório ${acc.account_name}`, { error: err.message });
            }
        }
    }

    /**
     * Envia o relatório AGORA pra uma única conta (chamado manual via endpoint).
     * Bypass horário/dedupe — usado pra teste do template + config.
     */
    async sendNowForAccount(accountId: string): Promise<void> {
        const accounts = await query<AccountWithSettings>(`
            SELECT
                a.id, a.user_id, a.account_name, a.meta_account_id,
                rs.client_name, rs.client_phone,
                rs.daily_whatsapp_template,
                    rs.report_template,
                ns.whatsapp_provider,
                ns.uazapi_url, ns.uazapi_token,
                ns.evolution_api_url, ns.evolution_api_key, ns.evolution_instance,
                ns.zapi_instance_id, ns.zapi_token, ns.zapi_client_token,
                ns.owner_whatsapp, ns.daily_report_approval_required
            FROM ad_accounts a
            LEFT JOIN report_settings rs ON rs.account_id = a.id
            LEFT JOIN notification_settings ns ON ns.user_id = a.user_id
            WHERE a.id = $1
        `, [accountId]);
        if (!accounts.length) throw new Error('Conta não encontrada');
        const acc = accounts[0];
        if (!acc.client_phone) throw new Error('Telefone/grupo do cliente não configurado');
        if (acc.client_phone.startsWith('https://chat.whatsapp.com/')) {
            throw new Error('Use ID do grupo (xxx@g.us) ou número, não link convite');
        }

        const dateStr = yesterdayBRT();
        const message = await this.buildFullReport(acc, dateStr);

        if (acc.daily_report_approval_required && acc.owner_whatsapp) {
            await this.queueForApproval(acc, message, dateStr);
            logger.info(`📤 Envio manual p/ aprovação: ${acc.account_name}`);
        } else {
            await this.send(acc, acc.client_phone, message);
            logger.info(`✅ Envio manual concluído: ${acc.account_name} → ${acc.client_phone}`);
        }
    }

    /**
     * Envia relatório diário de texto via WhatsApp para todas as contas habilitadas.
     * Chamado manualmente — sem filtro de horário, sem dedupe diário.
     */
    async sendDailyReports(): Promise<void> {
        // Busca contas com daily_whatsapp_enabled = true e client_phone configurado
        let accounts: AccountWithSettings[];
        try {
            accounts = await query<AccountWithSettings>(`
                SELECT
                    a.id, a.user_id, a.account_name, a.meta_account_id,
                    rs.client_name, rs.client_phone,
                    rs.daily_whatsapp_template,
                    rs.report_template,
                    ns.whatsapp_provider,
                    ns.uazapi_url, ns.uazapi_token,
                    ns.evolution_api_url, ns.evolution_api_key, ns.evolution_instance,
                    ns.zapi_instance_id, ns.zapi_token, ns.zapi_client_token,
                    ns.owner_whatsapp, ns.daily_report_approval_required
                FROM ad_accounts a
                JOIN report_settings rs ON rs.account_id = a.id
                LEFT JOIN notification_settings ns ON ns.user_id = a.user_id
                WHERE a.is_client_active = true
                  AND rs.daily_whatsapp_enabled = true
                  AND rs.client_phone IS NOT NULL
                  AND rs.client_phone <> ''
            `);
        } catch (err: any) {
            logger.warn('daily-whatsapp: coluna daily_whatsapp_enabled não existe ainda', { error: err.message });
            return;
        }

        if (!accounts.length) {
            logger.info('daily-whatsapp: nenhuma conta habilitada');
            return;
        }

        logger.info(`📱 Enviando relatório diário WhatsApp para ${accounts.length} conta(s)`);

        // Ontem em BRT
        const dateStr = yesterdayBRT();

        for (const acc of accounts) {
            if (acc.client_phone!.startsWith('https://chat.whatsapp.com/')) {
                logger.warn(`daily-whatsapp: ${acc.account_name} usa link convite — use o ID do grupo (xxx@g.us) ou número`);
                continue;
            }
            try {
                const message = await this.buildFullReport(acc, dateStr);

                // Modo aprovação: manda pro DONO com link, salva pendente
                if (acc.daily_report_approval_required && acc.owner_whatsapp) {
                    await this.queueForApproval(acc, message, dateStr);
                    logger.info(`📤 Relatório enviado pra aprovação: ${acc.account_name} → dono`);
                } else {
                    await this.send(acc, acc.client_phone!, message);
                    logger.info(`✅ Relatório diário enviado: ${acc.account_name} → ${acc.client_phone}`);
                }
            } catch (err: any) {
                logger.error(`Falha ao enviar relatório diário para ${acc.account_name}`, { error: err.message });
            }
        }
    }

    /**
     * Monta o relatório completo (3 períodos + ads ativos + top criativos) no formato cliente.
     */
    private async buildFullReport(acc: AccountWithSettings, todayDateStr: string): Promise<string> {
        // "Hoje" no relatório = data informada (geralmente ontem, conforme cron)
        const today = new Date(todayDateStr + 'T12:00:00Z');
        // Últimos 7 dias COMPLETOS antes do dia "Hoje"
        const last7End = new Date(today); last7End.setUTCDate(last7End.getUTCDate() - 1);
        const last7Start = new Date(last7End); last7Start.setUTCDate(last7Start.getUTCDate() - 6);
        // Mês corrente: dia 1 do mês de "Hoje" até o próprio "Hoje"
        const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
        const monthEnd = today;

        const todayStr = this.toISODate(today);
        const last7StartStr = this.toISODate(last7Start);
        const last7EndStr = this.toISODate(last7End);
        const monthStartStr = this.toISODate(monthStart);
        const monthEndStr = this.toISODate(monthEnd);

        const [todayM, last7M, monthM, activeAds, topAdsToday, topAds7d, reportLink, reportLink7d] = await Promise.all([
            this.getRangeMetrics(acc.id, todayStr, todayStr),
            this.getRangeMetrics(acc.id, last7StartStr, last7EndStr),
            this.getRangeMetrics(acc.id, monthStartStr, monthEndStr),
            this.countActiveAds(acc.id),
            this.getTopAdsForRange(acc.id, todayStr, todayStr).catch(() => []),
            this.getTopAdsForRange(acc.id, last7StartStr, last7EndStr).catch(() => []),
            this.generateReportSnapshot(acc, todayStr, todayStr).catch(() => ''),
            this.generateReportSnapshot(acc, last7StartStr, last7EndStr).catch(() => ''),
        ]);

        return this.buildMessageNew(acc, {
            today: { metrics: todayM, label: this.formatDayBR(todayStr) },
            last7d: { metrics: last7M, label: `${this.formatDayBR(last7StartStr)} a ${this.formatDayBR(last7EndStr)}` },
            month: { metrics: monthM, label: `${this.formatDayBR(monthStartStr)} a ${this.formatDayBR(monthEndStr)}` },
            activeAds,
            topAdsToday,
            topAds7d,
            reportLink,
            reportLink7d,
        });
    }

    /**
     * Gera snapshot HTML público do relatório e retorna a URL curta pra colar no WhatsApp.
     * Falha silenciosa: se algo der errado, retorna string vazia (template mostra fallback).
     */
    private async generateReportSnapshot(acc: AccountWithSettings, since: string, until: string): Promise<string> {
        try {
            const { buildReportForAccount, renderReportHTML, saveReportSnapshot } = await import('./pdf-report.service');
            const data = await buildReportForAccount(acc.user_id, acc.id, since, until);
            const html = renderReportHTML(data);
            const snapshot = await saveReportSnapshot(acc.user_id, acc.id, html, {
                periodStart: since, periodEnd: until, accountName: data.accountName,
            });
            return snapshot.url;
        } catch (err: any) {
            logger.warn('generateReportSnapshot falhou', { accountId: acc.id, error: err.message });
            return '';
        }
    }

    /**
     * Top 5 ads no período — usa Meta API via metaService pra ter nomes + métricas frescos.
     * Se falhar (sem token, etc), retorna [].
     */
    private async getTopAdsForRange(accountId: string, since: string, until: string): Promise<AdRankRow[]> {
        try {
            const accRows = await query<any>(
                `SELECT a.meta_account_id, a.user_id FROM ad_accounts a WHERE a.id = $1`,
                [accountId]
            );
            if (!accRows.length) return [];
            const { meta_account_id, user_id } = accRows[0];
            const userRows = await query<any>(`SELECT access_token FROM users WHERE id = $1`, [user_id]);
            const accessToken = userRows[0]?.access_token;
            if (!accessToken) return [];

            const { metaService } = await import('../meta/meta.service');
            const raw = await metaService.getAdInsightsForReport(user_id, accessToken, meta_account_id, since, until);
            if (!raw.length) return [];

            const ACTION_PRIORITY = [
                { type: 'offsite_conversion.fb_pixel_purchase', label: 'Compras' },
                { type: 'purchase', label: 'Compras' },
                { type: 'offsite_conversion.fb_pixel_lead', label: 'Leads' },
                { type: 'lead', label: 'Leads' },
                { type: 'onsite_conversion.messaging_conversation_started_7d', label: 'Conversas' },
                { type: 'onsite_conversion.total_messaging_connection', label: 'Conversas' },
                { type: 'link_click', label: 'Cliques' },
            ];
            // Determina ação DOMINANTE do período (maior volume entre todos os ads)
            const agg = new Map<string, number>();
            for (const r of raw) {
                for (const a of (r.actions || [])) {
                    agg.set(a.action_type, (agg.get(a.action_type) || 0) + (parseInt(a.value, 10) || 0));
                }
            }
            // Primeiro tipo da prioridade com volume > 0 vence (Compras > Leads > Conversas > Cliques).
            // Antes selecionava por maior volume — cliques/engajamento sempre venciam conversões.
            let dominant: { type: string; label: string } | null = null;
            for (const p of ACTION_PRIORITY) {
                if ((agg.get(p.type) || 0) > 0) { dominant = { type: p.type, label: p.label }; break; }
            }

            return raw.map((r: any) => {
                const spend = parseFloat(r.spend || '0');
                // Se temos ação dominante, extrai APENAS ela pra manter consistência
                let count = 0, label = 'Result.';
                if (dominant) {
                    const m = (r.actions || []).find((a: any) => a.action_type === dominant!.type);
                    count = m ? (parseInt(m.value, 10) || 0) : 0;
                    label = dominant.label;
                } else {
                    for (const p of ACTION_PRIORITY) {
                        const m = (r.actions || []).find((a: any) => a.action_type === p.type);
                        if (m && parseInt(m.value, 10) > 0) { count = parseInt(m.value, 10); label = p.label; break; }
                    }
                }
                return {
                    name: r.ad_name || '(sem nome)',
                    spend,
                    conversions: count,
                    action_label: label,
                    cpa: count > 0 ? spend / count : 0,
                    impressions: parseInt(r.impressions || '0', 10),
                };
            })
            // Filtra ads com spend mínimo (>= R$ 1) — evita ranking com ads que gastaram centavos
            .filter(a => a.spend >= 1.0)
            // Ranking por performance: quem tem resultado ordena por CPA (menor = melhor);
            // ads sem resultado vão pro fim, ordenados por spend desc
            .sort((a, b) => {
                if (a.conversions > 0 && b.conversions > 0) return a.cpa - b.cpa;
                if (a.conversions > 0) return -1;
                if (b.conversions > 0) return 1;
                return b.spend - a.spend;
            });
        } catch (err: any) {
            logger.warn('getTopAdsForRange falhou', { accountId, error: err.message });
            return [];
        }
    }

    private toISODate(d: Date): string {
        return d.toISOString().slice(0, 10);
    }

    private formatDayBR(iso: string): string {
        const [, m, d] = iso.split('-');
        return `${d}/${m}`;
    }

    private async getRangeMetrics(accountId: string, fromDate: string, toDate: string): Promise<RangeMetrics> {
        // Uma linha por campanha/dia, com o objective da campanha — pra poder separar
        // resultados quando a conta tem campanhas com objetivos diferentes (ex: uma
        // rodando "Conversas WhatsApp" e outra rodando "Visitas ao perfil"). Antes disso
        // o serviço somava tudo junto e etiquetava com um único label, misturando os dois.
        const rows = await query<any>(`
            SELECT ih.spend, ih.impressions, ih.actions, c.objective
            FROM insights_history ih
            JOIN campaigns c ON ih.campaign_id = c.id
            WHERE c.account_id = $1
              AND ih.date >= $2 AND ih.date <= $3
        `, [accountId, fromDate, toDate]);

        let spend = 0;
        let impressions = 0;
        const groups = new Map<string, { count: number; spend: number }>();

        for (const row of rows) {
            const rowSpend = parseFloat(row.spend) || 0;
            spend += rowSpend;
            impressions += parseInt(row.impressions) || 0;

            const { count, label } = metaService.extractPrimaryAction(row.actions, row.objective);
            if (count <= 0) continue;
            const g = groups.get(label) || { count: 0, spend: 0 };
            g.count += count;
            g.spend += rowSpend;
            groups.set(label, g);
        }

        const objective_breakdown: ObjectiveBreakdownGroup[] = Array.from(groups.entries())
            .map(([label, g]) => ({ label, count: g.count, spend: g.spend, cost_per: g.count > 0 ? g.spend / g.count : 0 }))
            .sort((a, b) => b.spend - a.spend);

        // Grupo dominante (maior spend) alimenta os placeholders "simples" já existentes
        // ({today_leads}, {today_action_label}...) — mantém templates antigos funcionando
        // sem mudança, só que agora sem misturar contagem de objetivos diferentes.
        const dominant = objective_breakdown[0];
        const leads = dominant?.count || 0;

        return {
            spend,
            impressions,
            leads,
            cost_per_lead: leads > 0 ? (dominant!.spend / leads) : 0,
            primary_action_label: dominant?.label || 'Conversões',
            objective_breakdown,
        };
    }

    private async countActiveAds(accountId: string): Promise<number> {
        // "Ativos" = ACTIVE/em análise NO META + tiveram impressões nos últimos 7 dias
        // (filtro de impressões evita contar campaigns pausadas que ficaram com status defasado)
        const r = await query<any>(`
            SELECT COUNT(DISTINCT c.id)::INT AS n
            FROM campaigns c
            LEFT JOIN insights_history ih ON ih.campaign_id = c.id
                AND ih.date >= (CURRENT_DATE - INTERVAL '7 days')
                AND ih.impressions > 0
            WHERE c.account_id = $1
              AND (
                  c.status IN ('ACTIVE', 'IN_PROCESS', 'PENDING_REVIEW', 'IN_REVIEW', 'PREAPPROVED')
                  OR ih.id IS NOT NULL
              )
        `, [accountId]);
        return Number(r[0]?.n ?? 0);
    }

    private greetingPrefix(): string {
        const hour = new Date().getHours();
        if (hour < 12) return 'Bom dia';
        if (hour < 18) return 'Boa tarde';
        return 'Boa noite';
    }

    private buildMessageNew(
        acc: AccountWithSettings,
        data: {
            today: { metrics: RangeMetrics; label: string };
            last7d: { metrics: RangeMetrics; label: string };
            month: { metrics: RangeMetrics; label: string };
            activeAds: number;
            topAdsToday?: AdRankRow[];
            topAds7d?: AdRankRow[];
            reportLink?: string;
            reportLink7d?: string;
        }
    ): string {
        const clientName = acc.client_name || acc.account_name || 'Cliente';
        const greeting = this.greetingPrefix();

        // Prioridade: template customizado > template predefinido > default
        const template = (acc.daily_whatsapp_template && acc.daily_whatsapp_template.trim())
            ? acc.daily_whatsapp_template
            : getTemplateByName((acc as any).report_template || 'default');

        const vars = buildTemplateVars({
            client_name: clientName,
            greeting,
            today: data.today,
            last7d: data.last7d,
            month: data.month,
            activeAds: data.activeAds,
            topAdsToday: data.topAdsToday,
            topAds7d: data.topAds7d,
            reportLink: data.reportLink,
            reportLink7d: data.reportLink7d,
        });

        return renderTemplate(template, vars);
    }

    /**
     * Salva o relatório como pendente de aprovação e manda link pro dono via WhatsApp.
     */
    private async queueForApproval(
        acc: AccountWithSettings,
        message: string,
        dateStr: string,
    ): Promise<void> {
        const token = crypto.randomBytes(18).toString('hex');
        await query(
            `INSERT INTO daily_report_approvals
             (user_id, account_id, report_date, client_name, client_phone, message_text, approval_token, status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')`,
            [
                acc.user_id, acc.id, dateStr,
                acc.client_name || acc.account_name,
                acc.client_phone,
                message,
                token,
            ]
        );

        const approvalUrl = `${PUBLIC_BASE_URL}/api/v1/r/${token}`;
        const previewLines = message.split('\n').slice(0, 3).join('\n');
        const ownerMessage =
            `📋 *Aprovação pendente — ${acc.client_name || acc.account_name}*\n` +
            `📅 ${this.formatDateBR(dateStr)}\n\n` +
            `Cliente: ${acc.client_phone}\n\n` +
            `${previewLines}…\n\n` +
            `━━━━━━━━━━━━━━━━━\n` +
            `👇 *Ver e aprovar:*\n${approvalUrl}`;

        await this.send(acc, acc.owner_whatsapp!, ownerMessage);
    }

    /**
     * Reenvia um relatório APROVADO pro telefone do cliente.
     * Chamado pelo endpoint público de aprovação.
     */
    async sendApproved(approvalId: string): Promise<void> {
        const rows = await query<any>(`
            SELECT
                dra.id, dra.user_id, dra.account_id, dra.client_phone, dra.message_text, dra.status,
                ns.whatsapp_provider,
                ns.uazapi_url, ns.uazapi_token,
                ns.evolution_api_url, ns.evolution_api_key, ns.evolution_instance,
                ns.zapi_instance_id, ns.zapi_token, ns.zapi_client_token
            FROM daily_report_approvals dra
            LEFT JOIN notification_settings ns ON ns.user_id = dra.user_id
            WHERE dra.id = $1
        `, [approvalId]);
        if (!rows.length) throw new Error('Aprovação não encontrada');
        const r = rows[0];
        if (r.status === 'sent') return;

        const fakeAcc: AccountWithSettings = {
            id: r.account_id, user_id: r.user_id,
            account_name: '', meta_account_id: '',
            client_name: null, client_phone: r.client_phone,
            whatsapp_provider: r.whatsapp_provider,
            uazapi_url: r.uazapi_url, uazapi_token: r.uazapi_token,
            evolution_api_url: r.evolution_api_url, evolution_api_key: r.evolution_api_key,
            evolution_instance: r.evolution_instance,
            zapi_instance_id: r.zapi_instance_id, zapi_token: r.zapi_token,
            zapi_client_token: r.zapi_client_token,
            owner_whatsapp: null, daily_report_approval_required: null,
        };

        try {
            await this.send(fakeAcc, r.client_phone, r.message_text);
            await query(
                `UPDATE daily_report_approvals SET status = 'sent', sent_at = NOW() WHERE id = $1`,
                [approvalId]
            );
        } catch (err: any) {
            await query(
                `UPDATE daily_report_approvals SET status = 'failed', error_message = $2 WHERE id = $1`,
                [approvalId, err.message]
            );
            throw err;
        }
    }

    /**
     * Envia para uma conta específica (para testes manuais via endpoint).
     */
    async sendForAccount(userId: string, accountId: string, dateStr?: string, phone?: string): Promise<{ message: string }> {
        const rows = await query<AccountWithSettings>(`
            SELECT
                a.id, a.user_id, a.account_name, a.meta_account_id,
                rs.client_name, rs.client_phone,
                rs.daily_whatsapp_template, rs.report_template,
                ns.whatsapp_provider,
                ns.uazapi_url, ns.uazapi_token,
                ns.evolution_api_url, ns.evolution_api_key, ns.evolution_instance,
                ns.zapi_instance_id, ns.zapi_token, ns.zapi_client_token,
                ns.owner_whatsapp, ns.daily_report_approval_required
            FROM ad_accounts a
            LEFT JOIN report_settings rs ON rs.account_id = a.id
            LEFT JOIN notification_settings ns ON ns.user_id = a.user_id
            WHERE a.id = $1 AND a.user_id = $2
        `, [accountId, userId]);

        if (!rows.length) throw new Error('Conta não encontrada');

        const acc = rows[0];

        // phone pode vir como parâmetro (teste manual) ou da coluna client_phone (após migration 009)
        const resolvedPhone = phone || (acc as any).client_phone || null;
        if (!resolvedPhone) throw new Error('WhatsApp do cliente não configurado nesta conta');
        if (resolvedPhone.startsWith('https://chat.whatsapp.com/')) {
            throw new Error('Links convite não funcionam pra envio automático. Use o número (ex: 5511999999999) OU o ID do grupo (ex: 1234567890@g.us)');
        }
        acc.client_phone = resolvedPhone;

        const targetDate = dateStr || yesterdayBRT();

        const message = await this.buildFullReport(acc, targetDate);
        await this.send(acc, acc.client_phone!, message);

        return { message };
    }

    // ─── MÉTRICAS ─────────────────────────────────────────────────────────────

    private async getMetricsForDate(accountId: string, dateStr: string): Promise<DayMetrics> {
        const rows = await query<any>(`
            SELECT
                COALESCE(SUM(ih.spend), 0)         AS spend,
                COALESCE(SUM(ih.impressions), 0)   AS impressions,
                COALESCE(SUM(ih.clicks), 0)        AS clicks,
                COALESCE(SUM(ih.conversions), 0)   AS conversions,
                COALESCE(AVG(NULLIF(ih.ctr, 0)), 0) AS ctr,
                COALESCE(AVG(NULLIF(ih.cpc, 0)), 0) AS cpc,
                COALESCE(AVG(NULLIF(ih.cpm, 0)), 0) AS cpm,
                COALESCE(AVG(NULLIF(ih.roas, 0)), 0) AS roas
            FROM insights_history ih
            JOIN campaigns c ON ih.campaign_id = c.id
            WHERE c.account_id = $1
              AND ih.date = $2
        `, [accountId, dateStr]);

        const t = rows[0] || {};
        const spend = parseFloat(t.spend) || 0;
        const conversions = parseInt(t.conversions) || 0;

        // Determina o label da ação principal baseado no que tem valor
        const actionsRows = await query<any>(`
            SELECT ih.actions
            FROM insights_history ih
            JOIN campaigns c ON ih.campaign_id = c.id
            WHERE c.account_id = $1 AND ih.date = $2
        `, [accountId, dateStr]);

        const primaryActionLabel = this.detectPrimaryAction(actionsRows);

        return {
            spend,
            impressions: parseInt(t.impressions) || 0,
            clicks: parseInt(t.clicks) || 0,
            conversions,
            ctr: parseFloat(t.ctr) || 0,
            cpc: parseFloat(t.cpc) || 0,
            cpm: parseFloat(t.cpm) || 0,
            roas: parseFloat(t.roas) || 0,
            cost_per_conversion: conversions > 0 ? spend / conversions : 0,
            primary_action_label: primaryActionLabel,
        };
    }

    private detectPrimaryAction(actionsRows: any[]): string {
        const ACTION_PRIORITY = [
            { type: 'offsite_conversion.fb_pixel_purchase', label: 'Compras' },
            { type: 'purchase',                             label: 'Compras' },
            { type: 'offsite_conversion.fb_pixel_lead',     label: 'Leads' },
            { type: 'lead',                                 label: 'Leads' },
            { type: 'complete_registration',                label: 'Cadastros' },
            { type: 'onsite_conversion.messaging_conversation_started_7d', label: 'Conversas (WhatsApp)' },
            { type: 'onsite_conversion.total_messaging_connection',        label: 'Conexões' },
            { type: 'post_engagement',  label: 'Engajamentos' },
            { type: 'link_click',       label: 'Cliques' },
        ];

        const totals: Record<string, number> = {};
        for (const row of actionsRows) {
            const acts: any[] = Array.isArray(row.actions) ? row.actions : [];
            for (const a of acts) {
                totals[a.action_type] = (totals[a.action_type] || 0) + parseInt(a.value || '0', 10);
            }
        }

        for (const p of ACTION_PRIORITY) {
            if ((totals[p.type] || 0) > 0) return p.label;
        }
        return 'Conversões';
    }

    // ─── MENSAGEM ─────────────────────────────────────────────────────────────

    private buildMessage(acc: AccountWithSettings, m: DayMetrics, dateStr: string): string {
        const clientName = acc.client_name || acc.account_name;
        const dateFmt = this.formatDateBR(dateStr);

        const roas = m.roas > 0 ? `${m.roas.toFixed(2)}x` : '—';
        const cpa = m.cost_per_conversion > 0 ? `R$ ${m.cost_per_conversion.toFixed(2)}` : '—';
        const ctr = m.ctr > 0 ? `${m.ctr.toFixed(2)}%` : '—';
        const impressoes = m.impressions > 0 ? m.impressions.toLocaleString('pt-BR') : '0';
        const cliques = m.clicks > 0 ? m.clicks.toLocaleString('pt-BR') : '0';

        let msg = `📊 *Relatório do Dia — ${clientName}*\n`;
        msg += `📅 ${dateFmt}\n\n`;

        if (m.spend === 0 && m.impressions === 0) {
            msg += `_Nenhum dado encontrado para este dia._\n`;
            msg += `Verifique se as campanhas estavam ativas.`;
            return msg;
        }

        msg += `💰 *Investimento:* R$ ${m.spend.toFixed(2)}\n`;
        msg += `🎯 *${m.primary_action_label}:* ${m.conversions}\n`;

        if (m.cost_per_conversion > 0) {
            msg += `💸 *Custo por ${m.primary_action_label}:* ${cpa}\n`;
        }

        if (m.roas > 0) {
            msg += `📈 *ROAS:* ${roas}\n`;
        }

        msg += `🖱 *Cliques:* ${cliques}\n`;
        msg += `👁 *Impressões:* ${impressoes}\n`;
        msg += `📉 *CTR:* ${ctr}\n`;

        if (m.cpc > 0) {
            msg += `🔗 *CPC:* R$ ${m.cpc.toFixed(2)}\n`;
        }

        msg += `\n_Enviado automaticamente pelo TrafficAI_`;

        return msg;
    }

    private formatDateBR(dateStr: string): string {
        const [y, m, d] = dateStr.split('-');
        return `${d}/${m}/${y}`;
    }

    // ─── ENVIO ────────────────────────────────────────────────────────────────

    private async send(acc: AccountWithSettings, phone: string, message: string): Promise<void> {
        // Default: Evolution se ENV global estiver configurado, senão UazAPI (legado)
        const envEvolutionConfigured = !!process.env.EVOLUTION_API_BASE_URL && !!process.env.EVOLUTION_API_KEY;
        const provider = acc.whatsapp_provider || (envEvolutionConfigured ? 'evolution' : 'uazapi');

        if (provider === 'uazapi') {
            await this.sendViaUazapi(acc, phone, message);
        } else if (provider === 'zapi') {
            await this.sendViaZapi(acc, phone, message);
        } else {
            await this.sendViaEvolution(acc, phone, message);
        }
    }

    private normalizePhone(phone: string): string {
        // Group ID do WhatsApp: 1234567890@g.us — preserva como veio
        if (phone.includes('@g.us') || phone.includes('@s.whatsapp.net')) {
            return phone.trim();
        }
        return phone.replace(/\D/g, '');
    }

    private async sendViaUazapi(acc: AccountWithSettings, phone: string, message: string): Promise<void> {
        if (!acc.uazapi_url || !acc.uazapi_token) {
            throw new Error('UazAPI não configurada para este usuário (configure em Configurações → Notificações)');
        }

        const normalizedPhone = this.normalizePhone(phone);
        const baseUrl = acc.uazapi_url.replace(/\/$/, '');
        const url = `${baseUrl}/send/text`;

        try {
            await axios.post(url, {
                number: normalizedPhone,
                text: message,
            }, {
                headers: {
                    token: acc.uazapi_token,
                    'Content-Type': 'application/json',
                },
                timeout: 15000,
            });
        } catch (err: any) {
            const detail = err.response?.data
                ? JSON.stringify(err.response.data)
                : err.message;
            throw new Error(`UazAPI erro (${err.response?.status || 'sem resposta'}): ${detail}`);
        }
    }

    private async sendViaEvolution(acc: AccountWithSettings, phone: string, message: string): Promise<void> {
        // Fallbacks: per-user → ENV global → comm_integrations conectada do user
        let baseUrl = acc.evolution_api_url || process.env.EVOLUTION_API_BASE_URL || '';
        let apiKey = acc.evolution_api_key || process.env.EVOLUTION_API_KEY || '';
        let instance = acc.evolution_instance || '';

        if (!instance) {
            try {
                const integ = await query<any>(
                    `SELECT config, credentials FROM comm_integrations
                     WHERE user_id = $1 AND type = 'whatsapp_evolution' AND status = 'connected'
                     ORDER BY connected_at DESC NULLS LAST LIMIT 1`,
                    [acc.user_id]
                );
                if (integ.length) {
                    const cfg = integ[0].config || {};
                    const creds = integ[0].credentials || {};
                    instance = cfg.instanceName || cfg.instance || '';
                    if (!baseUrl) baseUrl = cfg.baseUrl || cfg.evolutionBaseUrl || '';
                    if (!apiKey) apiKey = creds.apiKey || creds.evolutionApiKey || '';
                }
            } catch (err: any) {
                logger.warn('lookup comm_integrations falhou', { error: err.message });
            }
        }

        if (!baseUrl || !instance) {
            throw new Error('Evolution API não configurada — defina EVOLUTION_API_BASE_URL/EVOLUTION_API_KEY no .env, ou conecte uma instância em /comercial/integrations, ou preencha em Configurações → Notificações');
        }

        const number = this.normalizePhone(phone);
        const url = `${baseUrl.replace(/\/$/, '')}/message/sendText/${instance}`;

        try {
            await axios.post(url, {
                number,
                text: message,           // v2 payload
            }, {
                headers: {
                    apikey: apiKey,
                    'Content-Type': 'application/json',
                },
                timeout: 15000,
            });
        } catch (err: any) {
            const detail = err.response?.data
                ? JSON.stringify(err.response.data)
                : err.message;
            throw new Error(`Evolution API erro (${err.response?.status || 'sem resposta'}): ${detail}`);
        }
    }

    private async sendViaZapi(acc: AccountWithSettings, phone: string, message: string): Promise<void> {
        if (!acc.zapi_instance_id || !acc.zapi_token) {
            throw new Error('Z-API não configurada');
        }

        const normalizedPhone = this.normalizePhone(phone);
        const url = `https://api.z-api.io/instances/${acc.zapi_instance_id}/token/${acc.zapi_token}/send-text`;

        try {
            await axios.post(url, {
                phone: normalizedPhone,
                message,
            }, {
                headers: {
                    'Client-Token': acc.zapi_client_token || '',
                    'Content-Type': 'application/json',
                },
                timeout: 15000,
            });
        } catch (err: any) {
            const detail = err.response?.data
                ? JSON.stringify(err.response.data)
                : err.message;
            throw new Error(`Z-API erro (${err.response?.status || 'sem resposta'}): ${detail}`);
        }
    }
}

export const dailyWhatsAppService = new DailyWhatsAppService();
