export interface MetaTemplateComponent {
    type: 'header' | 'body' | 'button';
    sub_type?: 'quick_reply' | 'url';
    parameters: MetaTemplateParameter[];
    index?: number;
}
export interface MetaTemplateParameter {
    type: 'text' | 'currency' | 'date_time' | 'image' | 'document' | 'video';
    text?: string;
    currency?: {
        fallback_value: string;
        code: string;
        amount_1000: number;
    };
    date_time?: {
        fallback_value: string;
    };
    image?: {
        link: string;
    };
    document?: {
        link: string;
        filename: string;
    };
    video?: {
        link: string;
    };
}
export interface MetaSendTemplatePayload {
    messaging_product: 'whatsapp';
    recipient_type: 'individual';
    to: string;
    type: 'template';
    template: {
        name: string;
        language: {
            code: string;
        };
        components?: MetaTemplateComponent[];
    };
}
export interface MetaSendMessageResponse {
    messaging_product: 'whatsapp';
    contacts: Array<{
        input: string;
        wa_id: string;
    }>;
    messages: Array<{
        id: string;
        message_status?: string;
    }>;
}
export interface MetaErrorResponse {
    error: {
        message: string;
        type: string;
        code: number;
        error_data?: {
            messaging_product: string;
            details: string;
        };
        fbtrace_id?: string;
    };
}
export interface MetaSubmitTemplateComponent {
    type: 'HEADER' | 'BODY' | 'FOOTER' | 'BUTTONS';
    format?: 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT';
    text?: string;
    buttons?: Array<{
        type: 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER';
        text: string;
        url?: string;
        phone_number?: string;
    }>;
    example?: {
        header_text?: string[];
        body_text?: string[][];
    };
}
export interface MetaSubmitTemplatePayload {
    name: string;
    language: string;
    category: string;
    components: MetaSubmitTemplateComponent[];
}
export interface MetaSubmitTemplateResponse {
    id: string;
    status: string;
    category: string;
}
export interface MetaWebhookPayload {
    object: 'whatsapp_business_account';
    entry: MetaWebhookEntry[];
}
export interface MetaWebhookEntry {
    id: string;
    changes: MetaWebhookChange[];
}
export interface MetaWebhookChange {
    value: MetaWebhookValue | MetaTemplateStatusWebhookValue;
    field: string;
}
export interface MetaTemplateStatusWebhookValue {
    event: 'APPROVED' | 'REJECTED' | 'FLAGGED' | 'DISABLED' | 'REINSTATED';
    message_template_id: number;
    message_template_name: string;
    message_template_language: string;
    reason: string | null;
    new_category?: string;
    previous_category?: string;
}
export interface MetaWebhookValue {
    messaging_product: 'whatsapp';
    metadata: {
        display_phone_number: string;
        phone_number_id: string;
    };
    contacts?: MetaWebhookContact[];
    messages?: MetaWebhookMessage[];
    statuses?: MetaWebhookStatus[];
}
export interface MetaWebhookContact {
    profile: {
        name: string;
    };
    wa_id: string;
}
export interface MetaWebhookMessage {
    from: string;
    id: string;
    timestamp: string;
    type: string;
    text?: {
        body: string;
    };
}
export interface MetaWebhookStatus {
    id: string;
    status: 'sent' | 'delivered' | 'read' | 'failed';
    timestamp: string;
    recipient_id: string;
    conversation?: {
        id: string;
        expiration_timestamp?: string;
        origin?: {
            type: string;
        };
    };
    pricing?: {
        billable: boolean;
        pricing_model: string;
        category: string;
    };
    errors?: Array<{
        code: number;
        title: string;
        message: string;
        error_data?: {
            details: string;
        };
    }>;
}
//# sourceMappingURL=whatsapp.types.d.ts.map