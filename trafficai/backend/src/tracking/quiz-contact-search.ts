import { quizSourceScope } from './quiz-sharing';
import { query } from '../database/connection';
import { decrypt } from '../shared/encryption';

export function quizContact(encrypted: string | null, order: any = {}) {
    const a = encrypted ? JSON.parse(decrypt(encrypted)) : {};
    return {
        child_name: String(a.name || a.nome || a.childName || a.child_name || ''),
        customer_name: String(order.customer_name || a.momName || a.responsavel || ''),
        customer_email: String(order.customer_email || a.email || ''),
        customer_phone: String(order.customer_phone || a.phone || a.whatsapp || a.telefone || ''),
        quiz_email: String(a.email || ''), quiz_phone: String(a.phone || a.whatsapp || a.telefone || ''),
    };
}
export const normalizeSearch = (v: unknown) => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
export function contactMatches(term: string, values: unknown[]): boolean {
    const q = normalizeSearch(term).trim();
    if (!q) return true;
    if (values.some(v => normalizeSearch(v).includes(q))) return true;
    if (!/^[\d\s()+.\-]+$/.test(q)) return false;
    const digits = q.replace(/\D/g, '');
    if (digits.length < 4) return false;
    const withoutCountry = digits.startsWith('55') && digits.length > 11 ? digits.slice(2) : digits;
    return values.some(value => {
        const phone = String(value || '').replace(/\D/g, '');
        const national = phone.startsWith('55') && phone.length > 11 ? phone.slice(2) : phone;
        const legacy = national.length === 11 && national[2] === '9' ? national.slice(0,2) + national.slice(3) : national;
        return phone.includes(digits) || national.includes(withoutCountry) || legacy.includes(withoutCountry);
    });
}

// Answers remain encrypted at rest. Search runs on the server, before pagination,
// and only within the already-authorized source and date range.
export async function matchingQuizSessions(sourceId: string, since: string, until: string, term: string) {
    const rows = await query<any>(`SELECT s.id,s.answers_encrypted,o.customer_name,o.customer_email,o.customer_phone,o.external_order_id
        FROM tracking_quiz_sessions s JOIN tracking_quiz_funnels f ON f.id=s.funnel_id LEFT JOIN tracking_orders o ON o.id=s.order_id
        WHERE ${quizSourceScope()} AND s.created_at>=($2::date::timestamp AT TIME ZONE 'America/Sao_Paulo')
        AND s.created_at<(($3::date+1)::timestamp AT TIME ZONE 'America/Sao_Paulo')`, [sourceId,since,until]);
    return rows.filter(row => contactMatches(term, [...Object.values(quizContact(row.answers_encrypted,row)),row.external_order_id])).map(row=>row.id);
}
