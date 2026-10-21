// Normalização comum: só aceita identificadores devolvidos explicitamente pelo checkout.
// Nunca associa pedidos por nome, horário ou valor aproximado.
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Checkout placeholders are absence, not attribution. Otherwise this common
// fallback reintroduces values that the platform adapter already discarded.
const clean = (v: unknown): string | undefined => typeof v === 'string' && v.trim() && v.length <= 300
    && !/^(?:n[aã]o informado|null|undefined|n\/a|\(not set\))$/i.test(v.trim()) ? v.trim() : undefined;
const obj = (v: any): Record<string, any> => v && typeof v === 'object' && !Array.isArray(v) ? v : {};
export function checkoutAttribution(body: any): { sck?: string; quiz_session_id?: string; utm_source?: string; utm_medium?: string; utm_campaign?: string; utm_content?: string; utm_term?: string } {
    const root=obj(body), data=obj(root.data);
    const containers=[obj(root.TrackingParameters),obj(root.tracking),obj(root.metadata),obj(root.utm),obj(root.url_params?.query_params),obj(root.url_params),obj(data.tracking),obj(data.metadata),obj(data.utm),data,root];
    const result: Record<string,string> = {};
    for(const key of ['utm_source','utm_medium','utm_campaign','utm_content','utm_term','sck']) {
        const value=containers.map(c=>clean(c[key])).find(Boolean);if(value)result[key]=value;
    }
    // quiz_session_id explícito tem prioridade sobre o alias s1.
    const explicit=containers.map(c=>clean(c.quiz_session_id)).find(v=>v&&uuid.test(v));
    const alias=containers.map(c=>clean(c.s1)).find(v=>v&&uuid.test(v));
    if(explicit||alias)result.quiz_session_id=(explicit||alias)!.toLowerCase();
    return result;
}
