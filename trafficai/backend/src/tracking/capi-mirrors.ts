import { query } from '../database/connection';
import type { TrackingEventInput, TrackingSource } from './tracking.service';

/** Explicit server-side routing. Never accept mirror destinations from a public payload. */
export const CAPI_MIRROR_RULES = [{
    sourceId: 'bcad48f8-de1f-4501-8dea-4810dc3b248d',
    targetId: 'fb8d4d3b-2603-4c55-8655-51ca086f3091',
    origin: 'https://historinha.alfamaxdigital.com.br',
    paths: ['/', '/index.html'],
}] as const;

function matchesPage(url: unknown, rule: typeof CAPI_MIRROR_RULES[number]): boolean {
    if (typeof url !== 'string') return false;
    try {
        const parsed = new URL(url);
        return parsed.origin === rule.origin && (rule.paths as readonly string[]).includes(parsed.pathname);
    } catch { return false; }
}

/** Each target keeps its own retry/audit record and receives the browser's event_id. */
export async function mirrorCapiEvent(
    source: TrackingSource,
    event: TrackingEventInput,
    deliver: (target: TrackingSource, event: TrackingEventInput) => Promise<unknown>,
): Promise<void> {
    if (!source.is_active || !event.event_id) return;
    for (const rule of CAPI_MIRROR_RULES) {
        if (rule.sourceId !== source.id) continue;
        let matched = matchesPage(event.event_source_url, rule);
        // Approved purchases may arrive on a gateway/webhook URL. Only connect them
        // when this exact source/session previously visited the principal quiz.
        if (!matched && event.event_name === 'Purchase' && event.session_id) {
            const visits = await query<{ event_source_url: string }>(
                `SELECT event_source_url FROM tracking_events
                 WHERE source_id=$1 AND session_id=$2 AND event_name='PageView'
                   AND event_source_url IS NOT NULL ORDER BY created_at DESC LIMIT 20`,
                [source.id, event.session_id],
            );
            matched = visits.some(visit => matchesPage(visit.event_source_url, rule));
        }
        if (!matched && event.event_name === 'Purchase' && event.session_id) {
            // Recovery/upsell links use their own click id. A paid order may still
            // identify the canonical quiz exactly through quiz_session_id/s1.
            const paid=await query<{event_source_url:string}>(`SELECT f.origin AS event_source_url FROM tracking_orders o
              JOIN tracking_quiz_sessions q ON q.id::text=COALESCE(o.raw->'TrackingParameters'->>'quiz_session_id',o.raw->'tracking'->>'quiz_session_id',o.raw->'TrackingParameters'->>'s1',o.raw->'tracking'->>'s1')
              JOIN tracking_quiz_funnels f ON f.id=q.funnel_id
              JOIN tracking_sources owner ON owner.id=o.source_id
              WHERE o.source_id=$1 AND owner.user_id=$2 AND o.sck=$3 AND o.status='approved' AND f.source_id=o.source_id
              LIMIT 2`,[source.id,source.user_id,event.session_id]);
            matched=paid.some(row=>matchesPage(row.event_source_url,rule));
        }
        if (!matched) continue;
        const targets = await query<TrackingSource>(
            `SELECT id,user_id,pixel_id,access_token,test_event_code,is_active,account_id
             FROM tracking_sources WHERE id=$1 AND user_id=$2 AND is_active=true`,
            [rule.targetId, source.user_id],
        );
        const target = targets[0];
        if (!target || target.id === source.id || target.pixel_id === source.pixel_id) continue;
        // Mirror only Meta: don't upload a second Google conversion.
        await deliver({ ...target, google_ads_account_id: null }, {
            ...event,
            custom_data: { ...event.custom_data, trafficai_mirrored_from: source.id },
        });
    }
}
