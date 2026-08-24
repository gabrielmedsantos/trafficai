// ==============================
// TrafficAI — API Client
// ==============================

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';

interface ApiResponse<T = any> {
    success: boolean;
    data?: T;
    error?: {
        message: string;
        code?: number | string;
        action?: string;
        plan?: string;
        plan_status?: string;
        trial_ends_at?: string | null;
    };
}

/**
 * Redireciona pra /billing quando o backend retorna 402 (Payment Required).
 * Só roda no client-side. Usa location.assign pra preservar histórico do browser
 * mas force um full navigate (Next.js router não funciona fora de componente).
 */
function handlePlanBlocked(err: NonNullable<ApiResponse['error']>): void {
    if (typeof window === 'undefined') return;
    // Já está em /billing — não redireciona (evita loop)
    if (window.location.pathname.startsWith('/billing')) return;
    // Não redireciona páginas públicas (link compartilhado, aprovação, etc)
    const publicPrefixes = ['/d/', '/report/', '/r/', '/marketing'];
    if (publicPrefixes.some(p => window.location.pathname.startsWith(p))) return;
    // Persiste o motivo pra billing page mostrar aviso
    try {
        sessionStorage.setItem('__tai_plan_block__', JSON.stringify({
            code: err.code,
            message: err.message,
            plan_status: err.plan_status,
            trial_ends_at: err.trial_ends_at,
            at: Date.now(),
        }));
    } catch { /* ignore */ }
    window.location.assign('/billing?blocked=1');
}

class ApiClient {
    private baseUrl: string;

    constructor(baseUrl: string) {
        this.baseUrl = baseUrl;
    }

    private getToken(): string | null {
        if (typeof window === 'undefined') return null;
        return localStorage.getItem('trafficai_token');
    }

    private getHeaders(): HeadersInit {
        const headers: HeadersInit = { 'Content-Type': 'application/json' };
        const token = this.getToken();
        if (token) headers['Authorization'] = `Bearer ${token}`;
        return headers;
    }

    async request<T>(method: string, path: string, body?: any): Promise<T> {
        const url = `${this.baseUrl}${path}`;
        const options: RequestInit = {
            method,
            headers: this.getHeaders(),
            ...(body && { body: JSON.stringify(body) }),
        };

        const res = await fetch(url, options);
        const json: ApiResponse<T> = await res.json();

        // 402 Payment Required — trial expirou / plano inativo → redireciona
        if (res.status === 402 && json.error) {
            handlePlanBlocked(json.error);
            throw new Error(json.error.message || 'Plano inativo');
        }

        if (!json.success) {
            throw new Error(json.error?.message || 'API request failed');
        }

        return json.data as T;
    }

    async upload<T>(path: string, formData: FormData): Promise<T> {
        const url = `${this.baseUrl}${path}`;
        const headers: HeadersInit = {};
        const token = this.getToken();
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const res = await fetch(url, { method: 'POST', headers, body: formData });
        const json: ApiResponse<T> = await res.json();
        if (res.status === 402 && json.error) {
            handlePlanBlocked(json.error);
            throw new Error(json.error.message || 'Plano inativo');
        }
        if (!json.success) throw new Error(json.error?.message || 'Upload failed');
        return json.data as T;
    }

    // Auth
    async login(email: string, password: string) {
        return this.request<{ token: string; user: any }>('POST', '/auth/login', { email, password });
    }

    async register(email: string, password: string, name: string) {
        return this.request<{ token: string; user: any }>('POST', '/auth/register', { email, password, name });
    }

    async getMe() {
        return this.request<any>('GET', '/auth/me');
    }

    async getMetaConnectUrl() {
        return this.request<{ url: string }>('GET', '/auth/meta/connect');
    }

    // Meta
    async getAccounts() {
        return this.request<any[]>('GET', '/meta/local/accounts');
    }

    async getActiveAccounts() {
        return this.request<any[]>('GET', '/meta/local/accounts/active');
    }

    async deactivateAllAccounts() {
        return this.request<any>('POST', '/meta/accounts/deactivate-all');
    }

    async addManualAccount(metaAccountId: string, accountName: string) {
        return this.request<any>('POST', '/meta/accounts/add-manual', {
            meta_account_id: metaAccountId,
            account_name: accountName,
        });
    }

    async updateAccountClientStatus(accountId: string, isClientActive: boolean, clientNotes?: string) {
        return this.request<any>('PATCH', `/meta/accounts/${accountId}/client-status`, {
            is_client_active: isClientActive,
            client_notes: clientNotes
        });
    }

    async updateAccountBilling(accountId: string, paymentType: 'pix' | 'card', balanceAlertThreshold: number) {
        return this.request<any>('PATCH', `/meta/accounts/${accountId}/billing`, {
            payment_type: paymentType,
            balance_alert_threshold: balanceAlertThreshold,
        });
    }

    async syncBalances() {
        return this.request<{ synced: number; message: string }>('POST', '/meta/accounts/sync-balances');
    }

    async getCampaigns(accountId?: string) {
        const query = accountId ? `?account_id=${accountId}` : '';
        return this.request<any[]>('GET', `/meta/campaigns${query}`);
    }

    async getInsights(campaignId: string, limit = 10000, since?: string, until?: string) {
        const params = new URLSearchParams({ campaign_id: campaignId, limit: String(limit) });
        if (since) params.set('since', since);
        if (until) params.set('until', until);
        return this.request<any[]>('GET', `/meta/local/insights?${params}`);
    }

    async triggerSync() {
        return this.request<any>('POST', '/meta/sync');
    }

    async syncAccount(accountId: string, since: string, until: string) {
        return this.request<any>('POST', '/meta/sync-account', { account_id: accountId, since, until });
    }

    // AI
    async analyzeCampaign(campaignId: string) {
        return this.request<any>('POST', '/ai/analyze-campaign', { campaign_id: campaignId });
    }

    async getAnalyses(campaignId?: string) {
        const query = campaignId ? `?campaign_id=${campaignId}` : '';
        return this.request<any[]>('GET', `/ai/analyses${query}`);
    }

    async analyzeCreativeText(textContent: string, context?: string) {
        return this.request<any>('POST', '/ai/analyze-creative', {
            type: 'text',
            text_content: textContent,
            context,
        });
    }

    // Templates library
    async listTemplates(filters?: { category?: string; channel?: string }) {
        const p = new URLSearchParams();
        if (filters?.category) p.set('category', filters.category);
        if (filters?.channel) p.set('channel', filters.channel);
        const q = p.toString() ? `?${p}` : '';
        return this.request<any[]>('GET', `/templates${q}`);
    }
    async templatesSummary() {
        return this.request<Array<{ channel: string; category: string; count: number }>>('GET', '/templates/summary');
    }
    async createTemplate(body: any) {
        return this.request<any>('POST', '/templates', body);
    }
    async updateTemplate(id: string, body: any) {
        return this.request<any>('PATCH', `/templates/${id}`, body);
    }
    async deleteTemplate(id: string) {
        return this.request<any>('DELETE', `/templates/${id}`);
    }

    // PDF Reports
    async generatePdfReport(accountId: string, periodStart: string, periodEnd: string) {
        return this.request<{
            url: string; token: string;
            account_name: string;
            period: { start: string; end: string };
            totals: any;
        }>('POST', '/reports/pdf/generate', {
            account_id: accountId,
            period_start: periodStart,
            period_end: periodEnd,
        });
    }
    async listPdfReports() {
        return this.request<any[]>('GET', '/reports/pdf/list');
    }
    async deletePdfReport(token: string) {
        return this.request<any>('DELETE', `/reports/pdf/${token}`);
    }

    // Meta Ads Embedded Signup
    async metaSignupConfig() {
        const res = await fetch(`${API_BASE}/meta-signup/config`);
        const json = await res.json();
        if (!json.success) throw new Error(json.error?.message || 'Falha config Meta');
        return json.data as { appId: string; graphApiVersion: string; configId: string | null; scope: string };
    }
    async metaSignupExchange(code: string, redirectUri?: string) {
        return this.request<{
            connected: boolean; meta_user_id: string; meta_user_name: string | null;
            token_expires_at: string; message: string;
        }>('POST', '/meta-signup/exchange', { code, redirect_uri: redirectUri });
    }
    async metaSignupStatus() {
        return this.request<{ connected: boolean; expired: boolean; meta_user_id: string | null; token_expires_at: string | null }>('GET', '/meta-signup/status');
    }
    async metaSignupDisconnect() {
        return this.request<any>('POST', '/meta-signup/disconnect');
    }

    // Google Ads
    async gaGetCredentials() {
        return this.request<any>('GET', '/google-ads/credentials');
    }
    async gaSetCredentials(body: any) {
        return this.request<any>('POST', '/google-ads/credentials', body);
    }
    async gaListAccessibleCustomers() {
        return this.request<Array<{ id: string; name: string; currency: string; timeZone: string; manager: boolean }>>('GET', '/google-ads/accessible-customers');
    }
    async gaImportAccount(body: { customer_id: string; account_name: string; currency?: string; time_zone?: string }) {
        return this.request<any>('POST', '/google-ads/accounts', body);
    }
    async gaListAccounts() {
        return this.request<any[]>('GET', '/google-ads/accounts');
    }
    async gaSyncAccount(accountId: string, days = 30) {
        return this.request<{ campaigns: number; insights: number }>('POST', `/google-ads/accounts/${accountId}/sync?days=${days}`);
    }
    async gaGetCampaigns(accountId: string) {
        return this.request<any[]>('GET', `/google-ads/accounts/${accountId}/campaigns`);
    }
    async gaSetCampaignStatus(googleCampaignId: string, accountId: string, status: 'ENABLED' | 'PAUSED') {
        return this.request<any>('PATCH', `/google-ads/campaigns/${googleCampaignId}/status`, { account_id: accountId, status });
    }

    // Meta actions (write)
    async metaSetCampaignStatus(campaignId: string, status: 'ACTIVE' | 'PAUSED') {
        return this.request<any>('PATCH', `/meta-actions/campaigns/${campaignId}/status`, { status });
    }
    async metaSetCampaignBudget(campaignId: string, body: { daily_budget?: number; lifetime_budget?: number }) {
        return this.request<any>('PATCH', `/meta-actions/campaigns/${campaignId}/budget`, body);
    }
    async metaDuplicateCampaign(campaignId: string, newName?: string) {
        return this.request<{ new_campaign_id: string }>('POST', `/meta-actions/campaigns/${campaignId}/duplicate`, { new_name: newName });
    }
    async metaSetAdStatus(metaAdId: string, status: 'ACTIVE' | 'PAUSED') {
        return this.request<any>('POST', `/meta-actions/ads/${metaAdId}/status`, { status });
    }

    // Automation rules
    async getAutomationRules() {
        return this.request<any[]>('GET', '/automation/rules');
    }
    async createAutomationRule(body: any) {
        return this.request<any>('POST', '/automation/rules', body);
    }
    async updateAutomationRule(id: string, body: any) {
        return this.request<any>('PATCH', `/automation/rules/${id}`, body);
    }
    async deleteAutomationRule(id: string) {
        return this.request<any>('DELETE', `/automation/rules/${id}`);
    }
    async runAutomationRule(id: string) {
        return this.request<{ evaluated: number; triggered: number }>('POST', `/automation/rules/${id}/run`);
    }
    async getAutomationRuleEvents(id: string) {
        return this.request<any[]>('GET', `/automation/rules/${id}/events`);
    }

    async analyzeTopCreatives(accountId: string, days = 30, limit = 10) {
        return this.request<{
            period: { days: number; label: string };
            account: { id: string; name: string };
            totals: { spend: number; conversions: number; impressions: number; clicks: number };
            top_ads: Array<{
                ad_id: string; ad_name: string; campaign_name: string;
                spend: number; impressions: number; clicks: number;
                ctr: number; cpc: number; cpm: number;
                conversions: number; cpa: number;
                action_type_label: string;
                thumbnail_url: string | null;
                permalink_url: string | null;
                media_type: string | null;
            }>;
            analysis: {
                winning_patterns: Array<{ pattern: string; evidence: string; ads: string[] }>;
                recommendations: string[];
                insights: string[];
                summary: string;
            };
        }>('POST', '/ai/top-creatives-analysis', {
            account_id: accountId,
            days,
            limit,
        });
    }

    // Prediction
    async getPrediction(campaignId: string) {
        return this.request<any>('GET', `/prediction/campaign/${campaignId}`);
    }

    // Team
    async getMe_role(): Promise<{ role: string }> {
        return this.request<{ role: string }>('GET', '/auth/me');
    }

    async getTeamMembers() {
        return this.request<any[]>('GET', '/team/members');
    }

    async createTeamMember(data: {
        name: string; email: string; password: string;
        role?: 'admin' | 'member'; department?: string; job_title?: string; avatar_color?: string;
    }) {
        return this.request<any>('POST', '/team/members', data);
    }

    async updateTeamMember(id: string, data: Partial<{
        name: string; email: string; password: string;
        role: 'admin' | 'member'; department: string; job_title: string; avatar_color: string;
    }>) {
        return this.request<any>('PATCH', `/team/members/${id}`, data);
    }

    async deleteTeamMember(id: string) {
        return this.request<{ message: string }>('DELETE', `/team/members/${id}`);
    }

    // Tracking (CAPI)
    async getTrackingSources() {
        return this.request<any[]>('GET', '/tracking/sources');
    }
    async getTrackingSource(id: string) {
        return this.request<any>('GET', `/tracking/sources/${id}`);
    }
    async createTrackingSource(data: {
        name: string; account_id?: string; pixel_id?: string; access_token?: string;
        test_event_code?: string; domain?: string;
    }) {
        return this.request<any>('POST', '/tracking/sources', data);
    }
    async updateTrackingSource(id: string, data: Partial<{
        name: string; account_id: string | null; pixel_id: string;
        access_token: string; test_event_code: string; domain: string; is_active: boolean;
    }>) {
        return this.request<any>('PATCH', `/tracking/sources/${id}`, data);
    }
    async deleteTrackingSource(id: string) {
        return this.request<any>('DELETE', `/tracking/sources/${id}`);
    }
    async rotateTrackingWebhook(id: string) {
        return this.request<{ webhook_secret: string }>('POST', `/tracking/sources/${id}/rotate-webhook`);
    }
    async getTrackingEvents(sourceId: string, params?: {
        limit?: number;
        offset?: number;
        status?: string;
        event_name?: string;
        from?: string;
        to?: string;
        search?: string;
    }): Promise<{ data: any[]; total: number; limit: number; offset: number }> {
        const q = new URLSearchParams();
        if (params?.limit !== undefined) q.set('limit', String(params.limit));
        if (params?.offset !== undefined) q.set('offset', String(params.offset));
        if (params?.status) q.set('status', params.status);
        if (params?.event_name) q.set('event_name', params.event_name);
        if (params?.from) q.set('from', params.from);
        if (params?.to) q.set('to', params.to);
        if (params?.search) q.set('search', params.search);
        const qs = q.toString();
        const url = `${this.baseUrl}/tracking/sources/${sourceId}/events${qs ? '?' + qs : ''}`;
        const res = await fetch(url, { headers: this.getHeaders() });
        const json = await res.json();
        if (!json.success) throw new Error(json.error?.message || 'Falha ao listar eventos');
        return {
            data: json.data || [],
            total: Number(json.meta?.total) || 0,
            limit: Number(json.meta?.limit) || (params?.limit ?? 50),
            offset: Number(json.meta?.offset) || (params?.offset ?? 0),
        };
    }
    async getTrackingHealth(sourceId: string) {
        return this.request<{
            status: { state: string; detail: string; severity: 'ok' | 'info' | 'warn' | 'error' };
            signals: {
                events_24h: number;
                pixel_events_24h: number;
                errors_7d: number;
                pending_retries: number;
                last_event_at: string | null;
                last_pixel_event_at: string | null;
                last_error_at: string | null;
            };
            checklist: { key: string; label: string; ok: boolean; hint?: string }[];
        }>('GET', `/tracking/sources/${sourceId}/health`);
    }
    async retryTrackingEvent(eventId: string) {
        return this.request<{ ok: boolean; status: 'sent' | 'failed' | 'test_only'; error?: string; retry_count: number }>(
            'POST', `/tracking/events/${eventId}/retry`
        );
    }
    async retryTrackingFailed(sourceId: string, opts?: { max_age_hours?: number; limit?: number }) {
        return this.request<{ attempted: number; succeeded: number; still_failed: number }>(
            'POST', `/tracking/sources/${sourceId}/retry-failed`, opts || {}
        );
    }

    // ── WhatsApp Daily Reports ──
    async getWhatsappReportVariables() {
        return this.request<{
            variables: { key: string; label: string; example: string }[];
            default_template: string;
        }>('GET', '/reports/whatsapp/variables');
    }
    async getWhatsappReportAccounts() {
        return this.request<{
            account_id: string;
            account_name: string;
            meta_account_id: string;
            is_client_active: boolean;
            client_name: string;
            client_phone: string | null;
            daily_whatsapp_enabled: boolean | null;
            daily_whatsapp_time: string;
            daily_whatsapp_last_sent_date: string | null;
            has_custom_template: boolean;
        }[]>('GET', '/reports/whatsapp/accounts');
    }
    async getWhatsappReportSettings(accountId: string) {
        return this.request<{
            account_id: string;
            client_name: string | null;
            client_phone: string | null;
            daily_whatsapp_enabled: boolean;
            daily_whatsapp_time: string;
            daily_whatsapp_last_sent_date: string | null;
            daily_whatsapp_template: string | null;
            effective_template: string;
            default_template: string;
        }>('GET', `/reports/whatsapp/settings/${accountId}`);
    }
    async updateWhatsappReportSettings(accountId: string, payload: {
        client_name?: string | null;
        client_phone?: string | null;
        daily_whatsapp_enabled?: boolean;
        daily_whatsapp_time?: string;
        daily_whatsapp_template?: string | null;
    }) {
        return this.request<any>('PUT', `/reports/whatsapp/settings/${accountId}`, payload);
    }
    async previewWhatsappReport(accountId: string, template?: string) {
        return this.request<{ preview: string; vars_used: Record<string, string> }>(
            'POST', `/reports/whatsapp/preview/${accountId}`, template !== undefined ? { template } : {}
        );
    }
    async sendWhatsappReportNow(accountId: string) {
        return this.request<{ sent: boolean }>('POST', `/reports/whatsapp/send-now/${accountId}`);
    }

    // Report toggles (semanal/mensal/cobrança)
    async getReportSettings(accountId: string) {
        return this.request<any>('GET', `/reports/settings/${accountId}`);
    }
    async updateReportSettings(accountId: string, payload: {
        client_name?: string; client_email?: string; client_phone?: string;
        daily_enabled?: boolean; weekly_enabled?: boolean; monthly_enabled?: boolean;
        auto_send_email?: boolean; auto_send_whatsapp?: boolean; daily_whatsapp_enabled?: boolean;
        daily_whatsapp_time?: string;
        weekly_report_enabled?: boolean; weekly_report_day?: number;
        monthly_report_enabled?: boolean; monthly_report_day?: number;
        billing_alert_enabled?: boolean; billing_alert_min_interval_hours?: number;
        report_owner_phone?: string;
        agency_name?: string; custom_message?: string;
    }) {
        return this.request<any>('PUT', `/reports/settings/${accountId}`, payload);
    }

    // ── Billing (Stripe) ──
    async getSubscription() {
        return this.request<{
            plan: string; status: string;
            trial_ends_at: string | null;
            current_period_start: string | null;
            current_period_end: string | null;
            cancel_at_period_end: boolean;
            limits: { max_clients: number; max_seats: number; monthly_ai_credits: number };
            usage: { clients: number; ai_credits_used: number };
            has_stripe_customer: boolean;
            is_admin?: boolean;
        }>('GET', '/billing/subscription');
    }
    async listPlans() {
        return this.request<Array<{ id: string; price_brl: number; max_clients: number; max_seats: number; monthly_ai_credits: number }>>('GET', '/billing/plans');
    }
    async createCheckout(plan: string) {
        return this.request<{ url: string }>('POST', '/billing/checkout', { plan });
    }
    async openBillingPortal() {
        return this.request<{ url: string }>('POST', '/billing/portal', {});
    }

    // ── Routines Config (cockpit da agenda) ──
    async listRoutinesConfig() {
        return this.request<any[]>('GET', '/routines-config');
    }
    async createRoutineConfig(body: any) {
        return this.request<any>('POST', '/routines-config', body);
    }
    async updateRoutineConfig(id: string, body: any) {
        return this.request<any>('PATCH', `/routines-config/${id}`, body);
    }
    async deleteRoutineConfig(id: string) {
        return this.request<{ success: boolean }>('DELETE', `/routines-config/${id}`);
    }
    async getRoutinesToday() {
        return this.request<{ date: string; items: any[] }>('GET', '/routines-config/today');
    }
    async getRoutinesWeek() {
        return this.request<Array<{ date: string; day_of_week: number; items: any[] }>>('GET', '/routines-config/week');
    }
    async markRoutineDone(id: string, isDone: boolean, date?: string) {
        return this.request<{ success: boolean }>('POST', `/routines-config/${id}/mark-done`, { is_done: isDone, date });
    }

    // ── Google Calendar events (via /routine) ──
    async getRoutineGoogleEvents(start: string, end: string) {
        return this.request<any>('GET', `/routine/google/events?start=${start}&end=${end}`).catch(() => []);
    }
    async getRoutineGoogleStatus() {
        return this.request<{ connected: boolean; email: string | null; configured: boolean }>('GET', '/routine/google/status').catch(() => ({ connected: false, email: null, configured: false }));
    }
    // ── Otimizações / tasks ──
    async listOptimizationTasks(since: string, until: string) {
        return this.request<any>('GET', `/tasks?since=${since}&until=${until}`).catch(() => []);
    }

    // ── Client Onboarding ──
    async listOnboardings() {
        return this.request<any[]>('GET', '/onboarding');
    }
    async getOnboarding(accountId: string) {
        return this.request<any>('GET', `/onboarding/account/${accountId}`);
    }
    async startOnboarding(accountId: string) {
        return this.request<any>('POST', `/onboarding/account/${accountId}/start`, {});
    }
    async toggleOnboardingItem(onboardingId: string, itemId: string, done: boolean, notes?: string) {
        return this.request<any>('PATCH', `/onboarding/${onboardingId}/item/${itemId}`, { done, notes });
    }
    async addOnboardingItem(onboardingId: string, body: { phase?: string; title: string; description?: string; owner?: 'agency' | 'client' }) {
        return this.request<any>('POST', `/onboarding/${onboardingId}/item`, body);
    }
    async deleteOnboardingItem(onboardingId: string, itemId: string) {
        return this.request<{ success: boolean }>('DELETE', `/onboarding/${onboardingId}/item/${itemId}`);
    }
    async pauseOnboarding(id: string) {
        return this.request<{ success: boolean }>('POST', `/onboarding/${id}/pause`, {});
    }
    async deleteOnboarding(id: string) {
        return this.request<{ success: boolean }>('DELETE', `/onboarding/${id}`);
    }
    async resumeOnboarding(id: string) {
        return this.request<{ success: boolean }>('POST', `/onboarding/${id}/resume`, {});
    }
    async getOnboardingsByClient(clientId: string) {
        return this.request<Array<{ ad_account: any; onboarding: any }>>('GET', `/onboarding/client/${clientId}`);
    }
    async getOnboardingSummary() {
        return this.request<{
            active_count: number;
            total_count: number;
            by_client: Record<string, { pct: number; done: number; total: number; status: string; onboarding_id: string }>;
        }>('GET', '/onboarding/summary').catch(() => ({ active_count: 0, total_count: 0, by_client: {} }));
    }
    async getOnboardingTemplate() {
        return this.request<{ items: any[]; is_custom: boolean; updated_at: string | null }>('GET', '/onboarding/template');
    }
    async saveOnboardingTemplate(items: any[]) {
        return this.request<{ count: number }>('PUT', '/onboarding/template', { items });
    }
    async resetOnboardingTemplate() {
        return this.request<any>('POST', '/onboarding/template/reset', {});
    }

    // ── Google OAuth (Drive + Calendar) ──
    async googleOAuthStatus() {
        return this.request<{ connected: boolean; email: string | null; scopes: string[] }>('GET', '/google/oauth/status');
    }
    async googleOAuthConnect(scopes?: string[]) {
        return this.request<{ url: string }>('POST', '/google/oauth/connect', scopes ? { scopes } : {});
    }
    async googleOAuthDisconnect() {
        return this.request<any>('POST', '/google/oauth/disconnect');
    }
    async googleDriveUploadPdf(snapshotToken: string, folder?: string) {
        return this.request<{ fileId: string; webViewLink: string }>('POST', '/google/drive/upload', {
            snapshot_token: snapshotToken, folder,
        });
    }
    async googleCalendarCreate(input: {
        title: string; startAt: string; endAt: string;
        description?: string; clientId?: string; attendees?: string[]; createMeet?: boolean;
    }) {
        return this.request<{ eventId: string; meetLink: string | null; htmlLink: string }>('POST', '/google/calendar/events', input);
    }
    async googleCalendarList(from: string, to: string) {
        const q = new URLSearchParams({ from, to });
        return this.request<any[]>('GET', `/google/calendar/events?${q}`);
    }
    async getTrackingStats(sourceId: string, days = 7) {
        return this.request<any>('GET', `/tracking/sources/${sourceId}/stats?days=${days}`);
    }
    async getTrackingEvent(eventId: string) {
        return this.request<any>('GET', `/tracking/events/${eventId}`);
    }
    async getTrackingWhatsAppLeads(sourceId: string) {
        return this.request<any[]>('GET', `/tracking/sources/${sourceId}/whatsapp-leads`);
    }
    async getTrackingDashboard(sourceId: string, since?: string, until?: string) {
        const q = new URLSearchParams();
        if (since) q.set('since', since);
        if (until) q.set('until', until);
        const qs = q.toString();
        return this.request<any>('GET', `/tracking/sources/${sourceId}/dashboard${qs ? '?' + qs : ''}`);
    }

    // Board (gerenciador de demandas)
    async getBoardCards(clientId?: string | 'none') {
        const qs = clientId ? `?client_id=${encodeURIComponent(clientId)}` : '';
        return this.request<any[]>('GET', `/board${qs}`);
    }
    async getBoardClientsSummary() {
        return this.request<any[]>('GET', '/board/clients-summary');
    }
    async getClientsList() {
        return this.request<any[]>('GET', '/clients');
    }
    async createClientQuick(payload: { name: string; avatar_color?: string }) {
        return this.request<any>('POST', '/clients', { name: payload.name, avatar_color: payload.avatar_color });
    }
    async createBoardCard(data: {
        title: string; description?: string; status?: string; priority?: string;
        project?: string | null; client_id?: string | null;
        due_date?: string | null; checklist?: any[];
    }) {
        return this.request<any>('POST', '/board', data);
    }
    async updateBoardCard(id: string, data: Partial<{
        title: string; description: string; status: string; priority: string;
        project: string | null; client_id: string | null;
        due_date: string | null; checklist: any[]; position: number;
    }>) {
        return this.request<any>('PATCH', `/board/${id}`, data);
    }
    async toggleBoardChecklist(cardId: string, itemId: string) {
        return this.request<any>('POST', `/board/${cardId}/checklist/${itemId}/toggle`);
    }
    async reorderBoardCards(cards: { id: string; status: string; position: number }[]) {
        return this.request<any>('POST', '/board/reorder', { cards });
    }
    async deleteBoardCard(id: string) {
        return this.request<any>('DELETE', `/board/${id}`);
    }
    async testTrackingSource(id: string) {
        return this.request<any>('POST', `/tracking/sources/${id}/test`);
    }
    async testTrackingCrm(id: string, creds?: { crm_type?: string; crm_subdomain?: string; crm_access_token?: string }) {
        return this.request<any>('POST', `/tracking/sources/${id}/crm/test`, creds || {});
    }
    async runTrackingBackfill(id: string, opts: {
        enrich_existing?: boolean;
        sync_won_purchases?: boolean;
        sync_leads?: boolean;
        lead_stage_ids?: number[];
        time_strategy?: 'clamp_7d' | 'now' | 'original';
    }) {
        return this.request<{
            enriched: number;
            purchases_created: number;
            leads_created: number;
            skipped: number;
            failed: number;
            total_purchase_value: number;
        }>('POST', `/tracking/sources/${id}/backfill`, opts);
    }
    async getTrackingCrmPipelines(id: string) {
        return this.request<{
            pipelines: {
                id: number;
                name: string;
                statuses: { id: number; name: string; type?: number; color?: string }[];
            }[];
        }>('GET', `/tracking/sources/${id}/crm/pipelines`);
    }

    // Alerts
    async getAlerts(unreadOnly = false, limit = 200) {
        return this.request<{ alerts: any[]; unread_count: number }>('GET', `/alerts?unread_only=${unreadOnly}&limit=${limit}`);
    }

    async markAlertRead(alertId: string) {
        return this.request<any>('POST', `/alerts/${alertId}/read`);
    }

    async markAllAlertsRead() {
        return this.request<any>('POST', '/alerts/read-all');
    }

    // ===== Commercial =====

    async getCommercialOverview(params: {
        period?: string; clientId?: string; pipelineId?: string; salespersonId?: string;
        from?: string; to?: string;
    } = {}) {
        const qs = new URLSearchParams();
        Object.entries(params).forEach(([k, v]) => v && qs.set(k, String(v)));
        return this.request<any>('GET', `/commercial/overview?${qs}`);
    }

    async getCommercialPipelines(clientId?: string) {
        const qs = clientId ? `?clientId=${clientId}` : '';
        return this.request<any[]>('GET', `/commercial/pipelines${qs}`);
    }

    async getCommercialSalespeople(clientId?: string, includeInactive = false) {
        const qs = new URLSearchParams();
        if (clientId) qs.set('clientId', clientId);
        if (includeInactive) qs.set('includeInactive', 'true');
        return this.request<any[]>('GET', `/commercial/salespeople?${qs}`);
    }

    async getCommercialConversations(params: {
        status?: string; salespersonId?: string; filter?: string; clientId?: string;
        period?: string; from?: string; to?: string; noPeriod?: boolean;
        page?: number; limit?: number;
    } = {}) {
        const qs = new URLSearchParams();
        Object.entries(params).forEach(([k, v]) => v != null && v !== '' && qs.set(k, String(v)));
        return this.request<{ rows: any[]; total: number; page: number; limit: number }>('GET', `/commercial/conversations?${qs}`);
    }

    async getCommercialConversationMessages(conversationId: string) {
        return this.request<any[]>('GET', `/commercial/conversations/${conversationId}/messages`);
    }

    async getCommercialLeads(params: {
        pipelineId?: string; stageId?: string; status?: string; salespersonId?: string;
        sourceId?: string; clientId?: string;
        minValue?: number; maxValue?: number;
        period?: string; from?: string; to?: string; noPeriod?: boolean;
        sort?: string; dir?: 'asc' | 'desc'; page?: number; limit?: number;
    } = {}) {
        const qs = new URLSearchParams();
        Object.entries(params).forEach(([k, v]) => v != null && v !== '' && qs.set(k, String(v)));
        return this.request<{ rows: any[]; total: number; page: number; limit: number }>('GET', `/commercial/leads?${qs}`);
    }

    async getCommercialTeam(params: { period?: string; clientId?: string } = {}) {
        const qs = new URLSearchParams();
        Object.entries(params).forEach(([k, v]) => v && qs.set(k, String(v)));
        return this.request<any[]>('GET', `/commercial/team?${qs}`);
    }

    async getCommercialTasks(params: {
        salespersonId?: string; clientId?: string;
        period?: string; from?: string; to?: string; noPeriod?: boolean;
    } = {}) {
        const qs = new URLSearchParams();
        Object.entries(params).forEach(([k, v]) => v != null && v !== '' && qs.set(k, String(v)));
        return this.request<any[]>('GET', `/commercial/tasks?${qs}`);
    }

    async completeCommercialTask(id: string) {
        return this.request<any>('POST', `/commercial/tasks/${id}/complete`);
    }

    async getCommercialLeadSources() {
        return this.request<any[]>('GET', '/commercial/lead-sources');
    }

    async getCommercialGoalForecast(clientId?: string) {
        const qs = clientId ? `?clientId=${clientId}` : '';
        return this.request<any>('GET', `/commercial/goals/forecast${qs}`);
    }

    async distributeCommercialGoal(payload: {
        totalGoal: number;
        distribution?: 'equal' | 'manual';
        overrides?: Record<string, number>;
        clientId?: string;
    }) {
        return this.request<any>('POST', '/commercial/goals/distribute', payload);
    }

    async updateCommercialSalesperson(id: string, payload: {
        monthly_goal_value?: number; name?: string; role?: string; active?: boolean;
    }) {
        return this.request<any>('PATCH', `/commercial/salespeople/${id}`, payload);
    }

    // ===== Commercial Integrations =====

    async listCommercialIntegrations() {
        return this.request<any[]>('GET', '/commercial/integrations');
    }

    async connectCommercialKommo(payload: { subdomain: string; accessToken: string; name?: string; clientId?: string }) {
        return this.request<{ integrationId: string; accountInfo: any; message: string }>(
            'POST', '/commercial/integrations/kommo/connect', payload
        );
    }

    async syncCommercialIntegration(id: string, full = false) {
        return this.request<any>('POST', `/commercial/integrations/${id}/sync${full ? '?full=true' : ''}`);
    }

    async disconnectCommercialIntegration(id: string) {
        return this.request<{ id: string }>('DELETE', `/commercial/integrations/${id}`);
    }

    async connectCommercialWhatsApp(payload: {
        name?: string;
        clientId?: string;
        evolutionBaseUrl?: string;
        evolutionApiKey?: string;
        webhookEvents?: string[];
    } = {}) {
        return this.request<{ integrationId: string; instanceName: string; qrCode: string | null; message: string }>(
            'POST', '/commercial/integrations/whatsapp/connect', payload
        );
    }

    async getCommercialIntegrationQr(id: string) {
        return this.request<{ status: string; qrCode: string | null; pairingCode: string | null }>(
            'GET', `/commercial/integrations/${id}/qr`
        );
    }

    // ===== Share Links =====

    async listCommercialShareLinks() {
        return this.request<any[]>('GET', '/commercial/share-links');
    }

    async createCommercialShareLink(payload: {
        name: string;
        filters?: Record<string, unknown>;
        password?: string;
        expiresAt?: string;
        clientId?: string;
    }) {
        return this.request<{ id: string; token: string }>(
            'POST', '/commercial/share-links', payload
        );
    }

    async updateCommercialShareLink(id: string, payload: { name?: string; active?: boolean }) {
        return this.request<{ id: string }>('PATCH', `/commercial/share-links/${id}`, payload);
    }

    async deleteCommercialShareLink(id: string) {
        return this.request<{ id: string }>('DELETE', `/commercial/share-links/${id}`);
    }

    // Endpoints públicos
    async getPublicShareLink(token: string) {
        return this.request<{ name: string; requiresPassword: boolean; expiresAt: string | null }>(
            'GET', `/commercial/public/${token}`
        );
    }

    async getPublicShareLinkData(token: string, payload: {
        password?: string; period?: string;
        dateRange?: { from: string; to: string };
        pipelineId?: string; salespersonId?: string;
    } = {}) {
        return this.request<any>(
            'POST', `/commercial/public/${token}/data`, payload
        );
    }

    async getPublicCommercialPipelines(token: string, payload: { password?: string } = {}) {
        return this.request<any[]>('POST', `/commercial/public/${token}/pipelines`, payload);
    }

    async getPublicCommercialSalespeople(token: string, payload: { password?: string; includeInactive?: boolean } = {}) {
        return this.request<any[]>('POST', `/commercial/public/${token}/salespeople`, payload);
    }

    async updatePublicCommercialSalesperson(token: string, id: string, payload: {
        password?: string; monthly_goal_value?: number; active?: boolean;
    }) {
        return this.request<{ id: string; monthly_goal_value: string }>(
            'PATCH', `/commercial/public/${token}/salespeople/${id}`, payload
        );
    }

    async getPublicCommercialLeadSources(token: string, payload: { password?: string } = {}) {
        return this.request<any[]>('POST', `/commercial/public/${token}/lead-sources`, payload);
    }

    async getPublicCommercialConversations(token: string, payload: {
        password?: string; salespersonId?: string; status?: string; filter?: string;
        period?: string; dateRange?: { from: string; to: string };
        page?: number; limit?: number;
    }) {
        return this.request<{ rows: any[]; total: number; page: number; limit: number }>(
            'POST', `/commercial/public/${token}/conversations`, payload
        );
    }

    async getPublicCommercialConversationMessages(token: string, conversationId: string, payload: { password?: string }) {
        return this.request<any[]>(
            'POST', `/commercial/public/${token}/conversations/${conversationId}/messages`, payload
        );
    }

    async getPublicCommercialLeads(token: string, payload: {
        password?: string; pipelineId?: string; stageId?: string; status?: string;
        salespersonId?: string; sourceId?: string; minValue?: number; maxValue?: number;
        period?: string; dateRange?: { from: string; to: string };
        sort?: string; dir?: 'asc' | 'desc'; page?: number; limit?: number;
    }) {
        return this.request<{ rows: any[]; total: number; page: number; limit: number }>(
            'POST', `/commercial/public/${token}/leads`, payload
        );
    }

    async getPublicCommercialTasks(token: string, payload: {
        password?: string; salespersonId?: string;
        period?: string; dateRange?: { from: string; to: string };
    }) {
        return this.request<any[]>('POST', `/commercial/public/${token}/tasks`, payload);
    }

    async getPublicCommercialTeam(token: string, payload: {
        password?: string; period?: string;
        dateRange?: { from: string; to: string };
    }) {
        return this.request<any[]>('POST', `/commercial/public/${token}/team`, payload);
    }
}

export const api = new ApiClient(API_BASE);
