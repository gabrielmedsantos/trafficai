// ==============================
// TrafficAI — Conta de demonstração da aba "Ao vivo"
// Gera métricas fictícias, mas coerentes: seguem o horário de Brasília
// (madrugada fraca, pico à noite), crescem ao longo do dia e não mudam
// entre duas leituras do mesmo minuto. Não lê nem grava nada no banco.
// ==============================

import { LiveMetrics, LiveFeedItem, projectSales } from './live-metrics.service';

const MIN = 60_000;
const BRT_OFFSET = 3 * 60; // minutos
const DAY_VISITS = 4200;
const TICKET = 97;
const NET_RATE = 0.9351; // taxa do gateway ~6,49%
const DAY_SPEND = 1890;
const RATES = { checkouts: 0.072, pix: 0.55, paid: 0.41 };

/** Curva de tráfego por hora (BRT): madrugada baixa, almoço e noite em alta. */
const HOUR_W = [0.35, 0.22, 0.14, 0.1, 0.09, 0.12, 0.25, 0.5, 0.75, 0.9, 1.0, 1.1, 1.25, 1.2, 1.05, 1.0, 1.0, 1.05, 1.2, 1.45, 1.65, 1.7, 1.4, 0.8];
const W_SUM = HOUR_W.reduce((a, b) => a + b, 0);

function rand(seed: number): number {
    let t = (seed + 0x6d2b79f5) | 0;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Minuto absoluto em BRT (minutos desde a época, deslocado pro fuso). */
const brtMinute = (ms: number) => Math.floor(ms / MIN) - BRT_OFFSET;
const dayOf = (bm: number) => Math.floor(bm / 1440);

/** Fator do dia: uns dias melhores que outros (0,85 a 1,15). */
const dayFactor = (day: number) => 0.85 + rand(day * 7919) * 0.3;

/** Visitas esperadas num minuto BRT, com ruído estável por minuto. */
function visitsAt(bm: number): number {
    const h = Math.floor((((bm % 1440) + 1440) % 1440) / 60);
    const base = (DAY_VISITS / 1440) * (HOUR_W[h] * 24 / W_SUM) * dayFactor(dayOf(bm));
    return base * (0.55 + rand(bm) * 0.9);
}

/** Visitas acumuladas do início do dia até o minuto bm (inclusive). */
function cumVisits(bm: number): number {
    let n = 0;
    for (let m = dayOf(bm) * 1440; m <= bm; m++) n += visitsAt(m);
    return n;
}

function stageCounts(bm: number) {
    const day = dayOf(bm);
    const v = cumVisits(bm);
    const c = v * RATES.checkouts * (0.9 + rand(day * 31) * 0.2);
    const p = c * RATES.pix * (0.9 + rand(day * 37) * 0.2);
    const paid = p * RATES.paid * (0.85 + rand(day * 41) * 0.3);
    return { visits: Math.round(v), checkouts: Math.round(c), pix: Math.round(p), paid: Math.round(paid) };
}

const CITIES: Array<[string, string, number]> = [
    ['São Paulo', 'São Paulo', 22], ['Campinas', 'São Paulo', 5], ['Santos', 'São Paulo', 3], ['Rio de Janeiro', 'Rio de Janeiro', 12],
    ['Niterói', 'Rio de Janeiro', 2], ['Belo Horizonte', 'Minas Gerais', 8], ['Uberlândia', 'Minas Gerais', 2], ['Salvador', 'Bahia', 6],
    ['Fortaleza', 'Ceará', 6], ['Recife', 'Pernambuco', 5], ['Curitiba', 'Paraná', 5], ['Porto Alegre', 'Rio Grande do Sul', 4],
    ['Brasília', 'Distrito Federal', 4], ['Goiânia', 'Goiás', 3], ['Manaus', 'Amazonas', 2], ['Belém', 'Pará', 2],
    ['Florianópolis', 'Santa Catarina', 3], ['São Luís', 'Maranhão', 2], ['Natal', 'Rio Grande do Norte', 2], ['João Pessoa', 'Paraíba', 2],
    ['Teresina', 'Piauí', 1], ['Maceió', 'Alagoas', 1], ['Vitória', 'Espírito Santo', 2], ['Cuiabá', 'Mato Grosso', 1],
    ['Campo Grande', 'Mato Grosso do Sul', 1],
];
const ABROAD: Array<[string, string, string]> = [['Lisboa', 'Lisboa', 'PT'], ['Miami', 'Florida', 'US'], ['Boston', 'Massachusetts', 'US']];
const CITY_SUM = CITIES.reduce((a, c) => a + c[2], 0);
const FIRST = ['Ana', 'Bruno', 'Camila', 'Diego', 'Eduarda', 'Felipe', 'Gabriela', 'Henrique', 'Isabela', 'João', 'Larissa', 'Lucas', 'Mariana', 'Mateus', 'Natália', 'Otávio', 'Patrícia', 'Rafael', 'Renata', 'Thiago', 'Vanessa', 'Vinícius', 'Juliana', 'Marcos', 'Aline', 'Carlos', 'Fernanda', 'Rodrigo'];
const LAST = 'ABCDFGLMNOPRSTV';

function pickCity(seed: number): { city: string; state: string; country: string } {
    if (rand(seed * 3) < 0.03) {
        const a = ABROAD[Math.floor(rand(seed * 5) * ABROAD.length)];
        return { city: a[0], state: a[1], country: a[2] };
    }
    let r = rand(seed) * CITY_SUM;
    for (const c of CITIES) { r -= c[2]; if (r <= 0) return { city: c[0], state: c[1], country: 'BR' }; }
    return { city: 'São Paulo', state: 'São Paulo', country: 'BR' };
}

const pickName = (seed: number) => `${FIRST[Math.floor(rand(seed * 11) * FIRST.length)]} ${LAST[Math.floor(rand(seed * 13) * LAST.length)]}.`;

export function buildDemoLive(now: Date = new Date()): LiveMetrics {
    const nowMs = now.getTime();
    const bm = brtMinute(nowMs);
    const ydayBm = bm - 1440;

    const perMinute = Array.from({ length: 60 }, (_, i) => Math.round(visitsAt(bm - 59 + i)));
    const series30 = perMinute.slice(30);
    const last30 = series30.reduce((a, b) => a + b, 0);
    let yday30 = 0;
    for (let m = ydayBm - 29; m <= ydayBm; m++) yday30 += visitsAt(m);
    const activeNow = Math.max(1, Math.round(perMinute.slice(-5).reduce((a, b) => a + b, 0) * 1.6));

    const today = stageCounts(bm);
    const hourAgo = dayOf(bm - 60) === dayOf(bm) ? stageCounts(bm - 60) : { visits: 0, checkouts: 0, pix: 0, paid: 0 };
    const threeAgo = dayOf(bm - 180) === dayOf(bm) ? stageCounts(bm - 180) : { visits: 0, checkouts: 0, pix: 0, paid: 0 };
    const yday = stageCounts(ydayBm);

    const dayFrac = cumVisits(bm) / (DAY_VISITS * dayFactor(dayOf(bm)));
    const spend = Math.round(DAY_SPEND * Math.min(1, dayFrac) * (0.95 + rand(dayOf(bm) * 53) * 0.1) * 100) / 100;
    const projected = Math.max(today.paid, projectSales(today.paid, today.paid - threeAgo.paid, now));
    const gross = today.paid * TICKET;
    const sent = Math.round((today.pix - today.paid) * 0.7);

    const label: Record<string, string> = { visits: 'Abriram a página', checkouts: 'Clicaram em comprar', pix: 'Geraram o pedido', paid: 'Pagaram' };
    const stages = (['visits', 'checkouts', 'pix', 'paid'] as const).map((key) => ({
        key, label: label[key], today: today[key], last_hour: today[key] - hourAgo[key], yday: yday[key],
    }));

    // Quem está ativo agora: cada pessoa ativa ganha uma cidade estável no minuto.
    const geoNow = new Map<string, { country: string; state: string; city: string; n: number }>();
    for (let i = 0; i < activeNow; i++) {
        const c = pickCity(bm * 97 + i);
        const k = `${c.country}|${c.state}|${c.city}`;
        const hit = geoNow.get(k);
        if (hit) hit.n++; else geoNow.set(k, { ...c, n: 1 });
    }
    const geoToday = new Map<string, { country: string; state: string; n: number }>();
    for (const c of CITIES) {
        const n = Math.round(today.visits * (c[2] / CITY_SUM) * (0.8 + rand(dayOf(bm) * 7 + c[2] * 131 + c[0].length) * 0.4));
        const hit = geoToday.get(c[1]);
        if (hit) hit.n += n; else geoToday.set(c[1], { country: 'BR', state: c[1], n });
    }

    // Feed dos últimos 30 min: eventos fixos por minuto, então "há X min" anda sozinho.
    const feed: LiveFeedItem[] = [];
    for (let m = bm; m > bm - 30 && feed.length < 14; m--) {
        const at = new Date((m + BRT_OFFSET) * MIN + Math.floor(rand(m * 17) * 50_000)).toISOString();
        if (at > now.toISOString()) continue;
        const r = rand(m * 23);
        const c = pickCity(m * 29);
        if (r < 0.1) feed.push({ kind: 'paid', name: pickName(m), ...c, value: TICKET, at });
        else if (r < 0.2) feed.push({ kind: 'pix', name: pickName(m), ...c, value: TICKET, at });
        else if (r < 0.27) feed.push({ kind: 'recovery', name: pickName(m), city: null, state: null, country: null, value: null, at });
        else if (r < 0.45) feed.push({ kind: 'checkout', name: null, ...c, value: null, at });
        else if (r < 0.85) feed.push({ kind: 'visit', name: null, ...c, value: null, at });
    }

    return {
        generated_at: now.toISOString(),
        active_now: activeNow,
        per_minute: perMinute,
        last30: { visits: last30, yday: Math.round(yday30), series: series30 },
        stages,
        money: {
            spend_today: spend,
            revenue_gross_today: gross,
            revenue_net_today: Math.round(gross * NET_RATE * 100) / 100,
            avg_ticket: TICKET,
            projected_sales: projected,
            projected_revenue: projected * TICKET,
        },
        recovery: { sent_today: sent, recovered_today: Math.round(sent * 0.17) },
        geo: {
            now: [...geoNow.values()].sort((a, b) => b.n - a.n),
            today: [...geoToday.values()].sort((a, b) => b.n - a.n),
        },
        feed,
    };
}
