// ==============================
// TrafficAI — API Client
// ==============================

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';

interface ApiResponse<T = any> {
    success: boolean;
    data?: T;
    error?: { message: string; code: number };
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

    async getInsights(campaignId: string, limit = 30, since?: string, until?: string) {
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

    // Prediction
    async getPrediction(campaignId: string) {
        return this.request<any>('GET', `/prediction/campaign/${campaignId}`);
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
}

export const api = new ApiClient(API_BASE);
