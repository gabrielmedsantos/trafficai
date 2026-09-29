// Padrão de UTM da Meta com id embutido: "{{campaign.name}}|{{campaign.id}}".
// Ids da Meta são numéricos longos — qualquer outra coisa depois do "|" não é
// tratada como id (evita casar "Campanha|Teste" como id "Teste").
export function parseUtmId(value: string | null | undefined): { name: string | null; id: string | null } {
    if (!value) return { name: null, id: null };
    const idx = value.lastIndexOf('|');
    if (idx === -1) return { name: value, id: null };
    const candidate = value.slice(idx + 1).trim();
    if (/^\d{6,}$/.test(candidate)) return { name: value.slice(0, idx).trim() || null, id: candidate };
    return { name: value, id: null };
}

export function metaIdsFromUtms(u: { utm_campaign?: string | null; utm_medium?: string | null; utm_content?: string | null }) {
    return {
        meta_campaign_id: parseUtmId(u.utm_campaign).id,
        meta_adset_id: parseUtmId(u.utm_medium).id,
        meta_ad_id: parseUtmId(u.utm_content).id,
    };
}
