export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const QUIZ_STEPS = [
    ['intro', 'Abertura'], ['social', 'Prova social'], ['1', 'Nome e idade'],
    ['2', 'Gênero'], ['3', 'Tom de pele'], ['4', 'Cor do cabelo'],
    ['5', 'Tipo de cabelo'], ['6', 'Olhos'], ['fb-rosto', 'Rosto personalizado'],
    ['7', 'Ensinamento'], ['8', 'Cenário'], ['fb-aventura', 'Aventura'],
    ['9', 'Personalidade'], ['10', 'Contato e dedicatória'], ['fb-final', 'Resumo'],
    ['11', 'Adicionais'], ['loading', 'Preferências'], ['result', 'Oferta'],
    ['redirect', 'Ir ao checkout'], ['checkout', 'Checkout'],
].map(([id, label]) => ({ id, label }));
const TEXT_KEYS = new Set(['name', 'age', 'gender', 'skin', 'hairColor', 'hairType', 'eyes', 'moral', 'setting', 'email', 'phone', 'momName', 'special', 'temperament', 'preference', 'commitment']);
const BOOL_KEYS = new Set(['discount', 'colorir', 'expressa', 'extra']);
export const DEFAULT_ANSWER_KEYS = [...TEXT_KEYS, ...BOOL_KEYS];
export function normalizeAnswers(value: unknown, keys: string[] = DEFAULT_ANSWER_KEYS): Record<string, string | boolean | number | string[]> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Respostas inválidas');
    const out: Record<string, string | boolean | number | string[]> = {};
    for (const [key, answer] of Object.entries(value)) {
        if (!keys.includes(key)) throw new Error('Campo não configurado');
        if (typeof answer === 'string' && answer.length <= 1000) out[key] = answer.trim();
        else if (typeof answer === 'boolean') out[key] = answer;
        else if (typeof answer === 'number' && Number.isFinite(answer)) out[key] = answer;
        else if (Array.isArray(answer) && answer.length<=30 && answer.every(v=>typeof v==='string' && v.length<=300)) out[key] = answer.map(v=>v.trim());
        else throw new Error('Campo de resposta inválido');
    }
    return out;
}
export function normalizeAttribution(value: unknown): Record<string, string> {
    const out: Record<string, string> = {};
    if (!value || typeof value !== 'object') return out;
    for (const key of ['utm_source', 'utm_campaign', 'utm_medium', 'utm_content', 'utm_term', 'fbclid', 'gclid']) {
        const v = (value as Record<string, unknown>)[key];
        if (typeof v === 'string') out[key] = v.slice(0, 300);
    }
    return out;
}
export function validOrigin(value: unknown): string {
    if (typeof value !== 'string') throw new Error('Informe a URL do site');
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new Error('URL inválida');
    if (url.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(url.hostname)) throw new Error('Use HTTPS');
    return url.origin;
}
export function validateEvent(body: any, steps: { id: string }[], answerKeys: string[] = DEFAULT_ANSWER_KEYS) {
    if (!body || !UUID.test(body.eventId || '') || !['view', 'complete', 'save'].includes(body.kind)
        || !steps.some(s => s.id === body.step) || !Number.isSafeInteger(body.revision)
        || body.revision < 1 || body.revision > 2147483647) throw new Error('Evento inválido');
    return { eventId: body.eventId, kind: body.kind, step: body.step, revision: body.revision, answers: normalizeAnswers(body.answers, answerKeys) };
}
export function normalizeFunnel(body: any) {
    const { slug, name, steps, answerKeys, completedStep, checkoutStep } = body || {};
    if (typeof slug !== 'string' || !/^[a-z0-9][a-z0-9-]{0,79}$/.test(slug)
        || typeof name !== 'string' || !name.trim() || name.length > 120
        || !Array.isArray(steps) || !steps.length || steps.length > 100
        || !Array.isArray(answerKeys) || answerKeys.length > 60) throw new Error('Configuração inválida');
    const normalizedSteps = steps.map(s=>{
        if (!s || typeof s.id !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(s.id)
            || typeof s.label !== 'string' || !s.label.trim() || s.label.length>120) throw new Error('Etapa inválida');
        return {id:s.id,label:s.label.trim()};
    });
    if (new Set(normalizedSteps.map(s=>s.id)).size!==steps.length) throw new Error('Etapas repetidas');
    if (!answerKeys.every(k=>typeof k==='string' && /^[a-zA-Z][a-zA-Z0-9_]{0,59}$/.test(k) && !['constructor','prototype','__proto__'].includes(k))
        || new Set(answerKeys).size!==answerKeys.length) throw new Error('Campos inválidos');
    for(const milestone of [completedStep,checkoutStep]) if(milestone && !normalizedSteps.some(s=>s.id===milestone)) throw new Error('Marco inválido');
    return {slug,name:name.trim(),origin:validOrigin(body.origin),steps:normalizedSteps,answerKeys,completedStep:completedStep||null,checkoutStep:checkoutStep||null};
}
