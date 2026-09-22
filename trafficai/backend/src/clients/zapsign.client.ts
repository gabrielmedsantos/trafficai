// ==============================
// TrafficAI — ZapSign API Client
// Assinatura eletrônica dos contratos gerados. Contrato confirmado contra a
// documentação oficial (docs.zapsign.com.br): POST /api/v1/docs/ pra criar o
// documento a partir de base64_pdf, e POST /api/v1/user/company/webhook/ pra
// registrar o callback (com header customizado, já que a ZapSign não assina
// os webhooks — o header secreto é o que garante que a chamada veio de um
// webhook que NÓS criamos).
// ==============================

import axios, { AxiosError } from 'axios';

const ZAPSIGN_BASE = 'https://api.zapsign.com.br/api/v1';

export interface ZapsignSigner {
    name: string;
    email?: string;
    phoneCountry?: string;
    phoneNumber?: string;
}

export interface ZapsignCreateDocumentResult {
    token: string;
    signUrl: string;
    status: string;
}

function formatZapsignError(error: unknown): string {
    if (error instanceof AxiosError) {
        const data = error.response?.data;
        return data?.message || data?.detail || JSON.stringify(data) || error.message;
    }
    return error instanceof Error ? error.message : String(error);
}

/** Cria o documento na ZapSign a partir do PDF (base64) e devolve o link de assinatura. */
export async function zapsignCreateDocument(
    apiToken: string,
    name: string,
    base64Pdf: string,
    signer: ZapsignSigner
): Promise<ZapsignCreateDocumentResult> {
    try {
        const { data } = await axios.post(
            `${ZAPSIGN_BASE}/docs/`,
            {
                name,
                base64_pdf: base64Pdf,
                lang: 'pt-br',
                signers: [{
                    name: signer.name,
                    email: signer.email || undefined,
                    phone_country: signer.phoneNumber ? (signer.phoneCountry || '55') : undefined,
                    phone_number: signer.phoneNumber || undefined,
                    auth_mode: 'assinaturaTela',
                }],
            },
            { headers: { Authorization: `Bearer ${apiToken}`, 'Content-Type': 'application/json' }, timeout: 30000 }
        );
        const firstSigner = data?.signers?.[0];
        if (!data?.token || !firstSigner?.sign_url) {
            throw new Error('ZapSign não retornou token/sign_url do documento');
        }
        return { token: data.token, signUrl: firstSigner.sign_url, status: data.status };
    } catch (error) {
        throw new Error(`Erro ao criar documento na ZapSign: ${formatZapsignError(error)}`);
    }
}

/** Registra (ou re-registra) o webhook de "documento assinado" pra essa conta ZapSign. */
export async function zapsignRegisterWebhook(apiToken: string, webhookUrl: string, secret: string): Promise<void> {
    try {
        await axios.post(
            `${ZAPSIGN_BASE}/user/company/webhook/`,
            {
                url: webhookUrl,
                type: 'doc_signed',
                headers: [{ name: 'X-TAI-Zapsign-Secret', value: secret }],
            },
            { headers: { Authorization: `Bearer ${apiToken}`, 'Content-Type': 'application/json' }, timeout: 20000 }
        );
    } catch (error) {
        throw new Error(`Erro ao registrar webhook na ZapSign: ${formatZapsignError(error)}`);
    }
}

/** Valida o token testando uma chamada simples (lista de docs, 1 item). */
export async function zapsignValidateToken(apiToken: string): Promise<boolean> {
    try {
        await axios.get(`${ZAPSIGN_BASE}/docs/?page=1`, {
            headers: { Authorization: `Bearer ${apiToken}` }, timeout: 15000,
        });
        return true;
    } catch {
        return false;
    }
}

/** Baixa o PDF assinado a partir da URL temporária (válida por 60min) que vem no webhook. */
export async function downloadZapsignFile(url: string): Promise<Buffer> {
    const { data } = await axios.get<ArrayBuffer>(url, { responseType: 'arraybuffer', timeout: 30000 });
    return Buffer.from(data);
}
